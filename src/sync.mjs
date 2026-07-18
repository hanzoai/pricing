// Sync pricing data from three sources:
//   1. Zen Gateway  — internal Zen model pricing (single source of truth)
//   2. OpenRouter    — 300+ third-party models with pricing
//   3. HuggingFace Router — free serverless inference models (optional, needs HF_TOKEN)
//
// No hardcoded model lists for third-party — everything detected dynamically.
//
// Usage:
//   node src/sync.mjs          # run standalone
//   import { sync } from './sync.mjs'  # call from server

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  zenCatalog,
  ensoCatalog,
  zenFamilies,
  featuredModelIds,
  toolPricing,
  computePresets,
  doDropletSlugs,
  doFallbackPrices,
  gpuTiers,
  cloudPlans,
  blockStoragePricing,
  providerCosts,
  planRouting,
  cloudRegions,
} from "./models.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DATA_FILE = join(DATA_DIR, "pricing.json");

/**
 * fetch() with an AbortController timeout.
 */
async function fetchWithTimeout(url, opts = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const OPENROUTER_API = "https://openrouter.ai/api/v1/models";

// HuggingFace Router — free serverless inference models.
const HF_ROUTER_API = "https://router.huggingface.co/v1/models";

// ── DigitalOcean-first mode ────────────────────────────────────────────
// The catalog is DO-first: it surfaces ONLY DO-backed inference — Zen
// (which wraps do-ai upstreams) + do-ai's own utility models. The
// third-party OpenRouter/HuggingFace mirror is gated OFF by default so we
// run on DO credits and don't advertise ~340 paid third-party models.
//
// Flip ENABLE_OPENROUTER=true (env or provider-admin UI) to re-include the
// third-party mirror. This is a pure source toggle — dedup, featured,
// provider-summary, and totals all fold correctly over the empty set when
// off. HuggingFace rides the same switch (it is a third-party mirror too;
// it is additionally gated on HF_TOKEN).
const ENABLE_OPENROUTER = /^(1|true|yes|on)$/i.test(
  process.env.ENABLE_OPENROUTER || ""
);

/**
 * Resolve HF_TOKEN from env or cached token file (local dev).
 */
function resolveHFToken() {
  if (process.env.HF_TOKEN) return process.env.HF_TOKEN;
  const cached = join(homedir(), ".cache", "huggingface", "token");
  if (existsSync(cached)) {
    const token = readFileSync(cached, "utf-8").trim();
    if (token) return token;
  }
  return "";
}

const HF_TOKEN = resolveHFToken();

// ── DigitalOcean AI (do-ai) — Hanzo's first-party specialty inference upstream ──
// The SAME upstream the in-cluster model-sync CronJob reads. We surface do-ai's
// UTILITY models (embeddings, rerankers, image, routers, speech, video) to the
// public catalog under their upstream ids. do-ai CHAT/completion models are
// deliberately EXCLUDED: those are wrapped by the Zen brand (zenCatalog in
// models.mjs) and already mirrored via OpenRouter, so exposing them raw would
// both duplicate the third-party list and break the "Zen models are our own"
// brand policy. Detected dynamically — no hardcoded model list.
const DO_AI_URL = process.env.DO_AI_URL || "https://inference.do-ai.run";
const DO_AI_KEY = process.env.DO_AI_API_KEY || "";

// Public do-ai utility kinds → serving endpoint + default catalog pricing. A
// do-ai model whose id matches none of these is a chat/completion model and is
// NOT surfaced. Adding a kind here is the ONE place to widen public exposure.
const DO_AI_KINDS = [
  { kind: "embedding", endpoint: "/v1/embeddings",         match: (s) => /embedding|bge-m3|e5-large|gte-large|multi-qa|mpnet|mini-?lm/.test(s), pricing: { input: 0.02, output: 0 }, feature: "Text embeddings" },
  { kind: "rerank",    endpoint: "/v1/rerank",             match: (s) => /rerank/.test(s),                                              pricing: { input: 0.02, output: 0 }, feature: "Reranking" },
  { kind: "image",     endpoint: "/v1/images/generations", match: (s) => /diffusion|sdxl|gpt-image|flux|(^|[-_])image([-_]|$)/.test(s), pricing: { perUnit: 0.04 }, unit: "image", feature: "Text-to-image" },
  { kind: "speech",    endpoint: "/v1/audio/speech",       match: (s) => /(^|[-_])tts([-_]|$)|voicedesign|voice-design|text-to-speech/.test(s), pricing: { perUnit: 5.0 }, unit: "1M characters", feature: "Text-to-speech" },
  { kind: "video",     endpoint: "/v1/videos/generations", match: (s) => /(^|[-_])t2v([-_]|$)|(^|[-_])video([-_]|$)|wan2/.test(s),       pricing: { perUnit: 0.5 }, unit: "video", feature: "Text-to-video" },
  { kind: "router",    endpoint: "/v1/chat/completions",   match: (s) => s.startsWith("router:"),                                       pricing: null, feature: "Automatic model routing" },
];

// zen serves the Zen family and owns its prices: GET /v1/models carries `pricing`
// (the in-window rate) and `pricing_tiers` (what each context tier bills), as exact
// decimal strings. It is the same service `ai` discovers, under the same env name —
// a price has one home, and admin.hanzo.ai edits it there at runtime.
const ZEN_URL = process.env.ZEN_URL || "http://zen.zen.svc.cluster.local:8080";
const ZEN_KEY = process.env.ZEN_API_KEY || "";

// DigitalOcean API for real droplet pricing.
const DO_API = "https://api.digitalocean.com/v2/sizes";
const DO_TOKEN = process.env.DO_API_TOKEN || "";
const COMPUTE_MARKUP_MONTHLY = parseFloat(process.env.COMPUTE_MARKUP_MONTHLY || "1.0");

/**
 * Round pricing nicely:
 *   >= $1     -> 2 decimal places
 *   >= $0.01  -> 3 decimal places
 *   else      -> 4 decimal places
 */
function roundPrice(n) {
  if (n == null) return null;
  if (n >= 1) return Math.round(n * 100) / 100;
  if (n >= 0.01) return Math.round(n * 1000) / 1000;
  return Math.round(n * 10000) / 10000;
}

/**
 * Convert per-token cost to $/MTok.
 */
function perTokenToMTok(perToken) {
  if (perToken == null) return null;
  return roundPrice(perToken * 1_000_000);
}

/**
 * Convert OpenRouter per-token price string to $/MTok with markup.
 */
function toMTok(perTokenStr, markup) {
  if (perTokenStr == null || perTokenStr === "") return null;
  const perToken = parseFloat(perTokenStr);
  if (isNaN(perToken)) return null;
  return roundPrice(perToken * 1_000_000 * markup);
}

/**
 * Derive provider name from OpenRouter model ID.
 */
function providerFromId(id) {
  const slug = id.split("/")[0];
  const names = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    "meta-llama": "Meta",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    mistralai: "Mistral",
    cohere: "Cohere",
    "x-ai": "xAI",
    nvidia: "NVIDIA",
    amazon: "Amazon",
    perplexity: "Perplexity",
    minimax: "MiniMax",
    moonshotai: "Moonshot",
    "z-ai": "Zhipu",
    "arcee-ai": "Arcee AI",
    baidu: "Baidu",
    liquid: "Liquid AI",
    allenai: "Allen AI",
    nousresearch: "Nous Research",
    stepfun: "StepFun",
    upstage: "Upstage",
  };
  return names[slug] || slug;
}

/**
 * Read the whole Zen family from zen — the service that serves those models and
 * bills for them, so the list it returns IS the family and the price it quotes IS
 * the price we charge. zen's /v1/models carries each SKU's id, context window,
 * mode, pricing (exact decimal strings), and vision capability.
 *
 * The list is authoritative: zen is the one place a Zen SKU is born (its
 * catalog.yaml), so a model exists here iff zen serves it. There is no local
 * hand-maintained roster to drift — the old one listed phantom SKUs (zen5-nano-*,
 * zen5-embedding-0.6B) zen never served, whose price lookups always missed and
 * rendered null. If zen cannot be reached we surface no Zen model this cycle
 * rather than a stale fiction.
 */
async function fetchZenFamily() {
  const headers = ZEN_KEY ? { Authorization: `Bearer ${ZEN_KEY}` } : {};
  const url = `${ZEN_URL}/v1/models`;
  console.log(`[sync] Fetching Zen family from ${url}...`);

  const res = await fetchWithTimeout(url, { headers }, 15_000);
  if (!res.ok) {
    throw new Error(`zen /v1/models returned ${res.status}`);
  }
  const models = (await res.json()).data || [];
  if (models.length === 0) {
    throw new Error("zen /v1/models carried no model");
  }
  console.log(`[sync] Zen serves ${models.length} models.`);
  return models;
}

// The per-unit label for a media SKU's price (zen prices these per call/image/clip).
const MEDIA_UNIT = { image: "image", audio: "call", video: "clip", rerank: "call" };

// Title-case a zen id into a display name when no branded copy exists in the
// catalog metadata — "zen5-flash" → "Zen5 Flash".
function brandName(id) {
  return id.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const numOrNull = (v) => (v == null || v === "" ? null : Number(v));

/**
 * The Zen family as this catalog renders it: every SKU zen serves, at zen's price,
 * with branded copy grafted on where the catalog has it. Pure — the whole reason
 * it is separable from the sync's IO — so it is unit-testable against a captured
 * zen /v1/models body.
 *
 * `zenModels` is zen's /v1/models `data` array; `metaCatalog` is the branded-copy
 * roster (fullName/description/features/tier/specs) keyed by SKU name. Family
 * membership and pricing come from zen; metaCatalog is presentation only, so an
 * entry that names a SKU zen does not serve simply never matches.
 */
export function buildZenModels(zenModels, metaCatalog = []) {
  const meta = new Map(metaCatalog.map((m) => [normalizeModelName(m.name), m]));
  return zenModels.map((zm) => {
    const m = meta.get(normalizeModelName(zm.id)) || {};
    const mode = zm.mode || "";
    const entry = {
      name: zm.id,
      // The open Zen family is Zen LM (open weights, co-designed with Zoo Labs
      // Foundation) — public owned_by "zenlm", not "hanzo".
      owned_by: "zenlm",
      fullName: m.fullName || brandName(zm.id),
      description: m.description || "",
      features: m.features || [],
      tier: m.tier || "",
      context: zm.context_window || m.context || null,
      specs: m.specs,
    };
    if (zm.capabilities?.vision) entry.vision = true;
    if (MEDIA_UNIT[mode]) {
      entry.pricingUnit = MEDIA_UNIT[mode];
      entry.pricing = { perUnit: numOrNull(zm.pricing?.input) };
    } else {
      entry.pricing = {
        input: numOrNull(zm.pricing?.input),
        output: numOrNull(zm.pricing?.output),
        cacheRead: numOrNull(zm.pricing?.cache_read),
        cacheWrite: null,
      };
    }
    return entry;
  });
}

/**
 * Fetch ALL models from OpenRouter API.
 * DO-first: returns [] when ENABLE_OPENROUTER is off (default) so the catalog
 * stays DO-only (Zen + do-ai). Never blocks the sync.
 */
async function fetchOpenRouterModels() {
  if (!ENABLE_OPENROUTER) {
    console.log("[sync] DO-first: OpenRouter disabled (ENABLE_OPENROUTER off) — skipping third-party mirror.");
    return [];
  }
  console.log("[sync] Fetching ALL models from OpenRouter...");
  const res = await fetchWithTimeout(OPENROUTER_API);
  if (!res.ok) {
    throw new Error(
      `OpenRouter API returned ${res.status}: ${await res.text()}`
    );
  }
  const body = await res.json();
  const models = body.data || [];
  console.log(`[sync] Received ${models.length} models from OpenRouter.`);
  return models;
}

/**
 * Fetch models from HuggingFace Router API.
 * Returns empty array if no token or on error.
 */
async function fetchHuggingFaceModels() {
  if (!ENABLE_OPENROUTER) {
    // DO-first: HuggingFace is a third-party mirror too — off with OpenRouter.
    return [];
  }
  if (!HF_TOKEN) {
    console.warn("[sync] No HF_TOKEN — skipping HuggingFace Router sync");
    return [];
  }
  console.log("[sync] Fetching models from HuggingFace Router...");
  try {
    const res = await fetchWithTimeout(HF_ROUTER_API, {
      headers: { Authorization: `Bearer ${HF_TOKEN}` },
    });
    if (!res.ok) {
      console.warn(`[sync] HuggingFace Router returned ${res.status} — skipping`);
      return [];
    }
    const body = await res.json();
    const models = body.data || [];
    console.log(`[sync] Received ${models.length} models from HuggingFace Router.`);
    return models;
  } catch (err) {
    console.warn(`[sync] HuggingFace Router fetch failed: ${err.message} — skipping`);
    return [];
  }
}

/**
 * Derive a clean display name from a HuggingFace model ID.
 * e.g. "meta-llama/Llama-4-Maverick-17B-128E-Instruct" -> "Llama 4 Maverick 17B 128E Instruct"
 */
function hfDisplayName(modelId) {
  const parts = modelId.split("/");
  const last = parts[parts.length - 1];
  return last.replace(/[-_]/g, " ");
}

/**
 * Normalize a model name for deduplication.
 * Strips org prefix, lowercases, removes hyphens/underscores/spaces.
 */
function normalizeModelName(id) {
  const parts = id.split("/");
  const name = parts[parts.length - 1];
  return name.toLowerCase().replace(/[-_\s.]/g, "");
}

/**
 * Process a single HuggingFace Router model into our format.
 */
function processHuggingFaceModel(hfModel) {
  return {
    id: `huggingface/${hfModel.id}`,
    name: hfDisplayName(hfModel.id),
    provider: "HuggingFace",
    contextWindow: null,
    features: ["HuggingFace Serverless Inference", "Free tier"],
    isFree: true,
    pricing: { input: 0, output: 0, cacheRead: null, cacheWrite: null },
  };
}

/**
 * Classify a do-ai model id into a public utility kind, or null for chat/completion.
 */
function doAiKind(id) {
  const s = id.toLowerCase();
  return DO_AI_KINDS.find((k) => k.match(s)) || null; // null → chat, not surfaced
}

/**
 * Fetch do-ai's model catalog (needs DO_AI_API_KEY). Returns [] gracefully when
 * unconfigured or on error — never blocks the sync (mirrors HuggingFace).
 */
async function fetchDoAiModels() {
  if (!DO_AI_KEY) {
    console.warn("[sync] No DO_AI_API_KEY — skipping do-ai first-party sync");
    return [];
  }
  try {
    const res = await fetchWithTimeout(`${DO_AI_URL}/v1/models`, {
      headers: { Authorization: `Bearer ${DO_AI_KEY}` },
    });
    if (!res.ok) {
      console.warn(`[sync] do-ai /v1/models returned ${res.status} — skipping`);
      return [];
    }
    const body = await res.json();
    const models = body.data || [];
    console.log(`[sync] Received ${models.length} models from do-ai.`);
    return models;
  } catch (err) {
    console.warn(`[sync] do-ai fetch failed: ${err.message} — skipping`);
    return [];
  }
}

/**
 * Prettify a do-ai id for display:
 *   "stable-diffusion-3.5-large" -> "Stable Diffusion 3.5 Large"
 *   "router:general"             -> "Router General"
 */
function doAiDisplayName(id) {
  return id
    .replace(/[:_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Process a do-ai utility model into a first-party (Hanzo-hosted) catalog entry,
 * shaped like a zenCatalog entry so server.mjs renders it as owned_by:"hanzo".
 */
function processDoAiModel(m, k) {
  const entry = {
    name: m.id,
    fullName: doAiDisplayName(m.id),
    description: `${k.feature} — hosted by Hanzo.`,
    features: [k.feature, formatContext(m.context_length)].filter(Boolean),
    tier: "pro",
    context: m.context_length || null,
    specs: { arch: k.kind },
    endpoint: k.endpoint,
    category: "specialty",
    generation: "do-ai",
  };
  if (k.unit) {
    entry.pricingUnit = k.unit;
    entry.pricing = { perUnit: k.pricing.perUnit };
  } else {
    entry.pricing = k.pricing; // token pricing {input,output} or null (router)
  }
  return entry;
}

/**
 * Markup for OpenRouter pass-through prices.
 * Default: 1.0 (no markup). Zen models use zen-gateway pricing directly.
 */
function getThirdPartyMarkup() {
  return parseFloat(process.env.THIRD_PARTY_MARKUP || "1.0");
}

/**
 * Build context window string from context_length number.
 */
function formatContext(ctxLength) {
  if (!ctxLength) return null;
  if (ctxLength >= 1_000_000) return `${Math.round(ctxLength / 1_000_000)}M context window`;
  if (ctxLength >= 1000) return `${Math.round(ctxLength / 1000)}k context window`;
  return `${ctxLength} context window`;
}

/**
 * Process a single OpenRouter model into our format.
 */
function processOpenRouterModel(orModel, markup) {
  const pricing = orModel.pricing || {};
  const promptPrice = parseFloat(pricing.prompt || "0");
  const completionPrice = parseFloat(pricing.completion || "0");
  const isFree = promptPrice === 0 && completionPrice === 0;

  const features = [];
  const ctxStr = formatContext(orModel.context_length);
  if (ctxStr) features.push(ctxStr);

  // Add a second distinguishing feature
  if (isFree) {
    features.push("Free tier");
  } else if (orModel.architecture?.modality) {
    features.push(orModel.architecture.modality);
  }

  return {
    id: orModel.id,
    name: orModel.name || orModel.id,
    provider: providerFromId(orModel.id),
    contextWindow: orModel.context_length || null,
    features,
    isFree,
    pricing: {
      input: isFree ? 0 : toMTok(pricing.prompt, markup),
      output: isFree ? 0 : toMTok(pricing.completion, markup),
      cacheRead: toMTok(pricing.input_cache_read, markup),
      cacheWrite: toMTok(pricing.input_cache_write, markup),
    },
  };
}

/**
 * Fetch real droplet pricing from the DigitalOcean API.
 * Falls back to doFallbackPrices if no token or API error.
 */
async function fetchDOPricing() {
  if (!DO_TOKEN) {
    console.warn("[sync] No DO_API_TOKEN — using fallback pricing");
    return doFallbackPrices;
  }
  try {
    console.log("[sync] Fetching DO droplet pricing...");
    const res = await fetchWithTimeout(DO_API, {
      headers: { Authorization: `Bearer ${DO_TOKEN}` },
    });
    if (!res.ok) {
      console.warn(`[sync] DO API returned ${res.status} — using fallback pricing`);
      return doFallbackPrices;
    }
    const body = await res.json();
    const prices = {};
    for (const size of body.sizes || []) {
      if (doDropletSlugs.includes(size.slug)) {
        prices[size.slug] = {
          vcpus: size.vcpus,
          memoryMB: size.memory,
          diskGB: size.disk,
          priceMonthly: size.price_monthly,
          priceHourly: size.price_hourly,
        };
      }
    }
    // Merge fallbacks for any slugs not returned by API.
    for (const slug of doDropletSlugs) {
      if (!prices[slug] && doFallbackPrices[slug]) {
        prices[slug] = doFallbackPrices[slug];
      }
    }
    console.log(`[sync] Got pricing for ${Object.keys(prices).length} DO droplet sizes.`);
    return prices;
  } catch (err) {
    console.warn(`[sync] DO API fetch failed: ${err.message} — using fallback pricing`);
    return doFallbackPrices;
  }
}

/**
 * Run the full sync: fetch from zen-gateway + OpenRouter + DO, write to disk.
 * Returns the pricing object.
 */
export async function sync() {
  // 1. Fetch Zen pricing from gateway (graceful — never blocks sync).
  let zenFamily;
  try {
    zenFamily = await fetchZenFamily();
  } catch (err) {
    console.error(`[sync] Zen family fetch failed: ${err.message} — no Zen models this cycle`);
    zenFamily = [];
  }

  // The catalog's branded copy (fullName/description/features/tier/specs), keyed by
  // zen id, enriches the live list where we have it. It is presentation only — the
  // family membership and pricing come from zen, so copy that names a phantom SKU
  // simply never matches and is ignored.
  // Build the Zen family from zen's live list: every SKU zen serves, at zen's price,
  // branded owned_by "zenlm". buildZenModels is the ONE builder (also unit-tested), so
  // the live path and the tests share it and branding can never drift between them.
  const pricedHanzo = buildZenModels(zenFamily, zenCatalog);

  // Zen catalog size, captured before we append do-ai specialty models.
  const zenModelCount = pricedHanzo.length;

  // 1b. Fetch do-ai first-party SPECIALTY models (embeddings, rerankers, image,
  // routers, speech, video) and surface them as Hanzo-hosted, deduped against the
  // Zen catalog. do-ai chat models are excluded (Zen-branded + OpenRouter-mirrored).
  // Graceful: no key / unreachable => zero surfaced, sync continues.
  const doAiRaw = await fetchDoAiModels();
  const zenNames = new Set(zenFamily.map((m) => normalizeModelName(m.id)));
  let doAiChatSkipped = 0;
  let doAiDupSkipped = 0;
  for (const m of doAiRaw) {
    const k = doAiKind(m.id);
    if (!k) { doAiChatSkipped++; continue; }
    if (zenNames.has(normalizeModelName(m.id))) { doAiDupSkipped++; continue; }
    pricedHanzo.push(processDoAiModel(m, k));
  }
  const doAiModelCount = pricedHanzo.length - zenModelCount;
  if (doAiRaw.length > 0) {
    console.log(`[sync] do-ai: ${doAiModelCount} specialty models surfaced (${doAiChatSkipped} chat excluded, ${doAiDupSkipped} dup).`);
  }

  // 1c. Enso — Hanzo's proprietary frontier family, generally available (owned_by
  // "hanzo"). A small fixed-price lineup (no live gateway discovery); the 3 SKUs
  // carry their own owned_by + retail pricing (see ensoCatalog).
  for (const em of ensoCatalog) pricedHanzo.push({ ...em });
  const ensoModelCount = ensoCatalog.length;

  // 2. Fetch ALL third-party models from OpenRouter (dynamic detection).
  const orModels = await fetchOpenRouterModels();
  const markup = getThirdPartyMarkup();

  // Process all OpenRouter models.
  const allOpenRouter = orModels.map((m) => processOpenRouterModel(m, markup));

  // 2b. Fetch HuggingFace Router models (free serverless inference).
  const hfRawModels = await fetchHuggingFaceModels();

  // Build a set of normalized names from OpenRouter for dedup.
  const orNormalizedNames = new Set(allOpenRouter.map((m) => normalizeModelName(m.id)));

  // Process HF models, skip duplicates already in OpenRouter.
  const hfModels = [];
  let hfSkipped = 0;
  for (const hfm of hfRawModels) {
    const norm = normalizeModelName(hfm.id);
    if (orNormalizedNames.has(norm)) {
      hfSkipped++;
      continue;
    }
    hfModels.push(processHuggingFaceModel(hfm));
  }
  if (hfRawModels.length > 0) {
    console.log(`[sync] HuggingFace: ${hfModels.length} unique models (${hfSkipped} duplicates skipped).`);
  }

  // Merge: OpenRouter + HuggingFace = all third-party.
  const allThirdParty = [...allOpenRouter, ...hfModels];

  // Separate into featured (pinned) and others.
  const featuredSet = new Set(featuredModelIds);
  const featured = [];
  const others = [];
  const free = [];

  for (const model of allThirdParty) {
    if (model.isFree) {
      free.push(model);
    }
    if (featuredSet.has(model.id)) {
      featured.push({ ...model, featured: true });
    } else {
      others.push(model);
    }
  }

  // Sort featured by the order in featuredModelIds.
  featured.sort(
    (a, b) => featuredModelIds.indexOf(a.id) - featuredModelIds.indexOf(b.id)
  );

  // Sort others by provider then name.
  others.sort((a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

  // Combine: featured first, then all others.
  const thirdPartyModels = [...featured, ...others];

  // 3. Fetch DO droplet pricing.
  const doPricing = await fetchDOPricing();

  // Build compute tiers with markup.
  //
  // Which supplier serves a tier, what they charge us, and what we add on top are
  // internal facts: they ride under `_internal`, the one key every public view
  // strips (see `publicView` in server.mjs). A customer sees the tier and its
  // price — never our supplier, our cost, or our margin. The same rule the cloud
  // plans below already follow ("customer-facing — no provider details").
  const compute = {
    _internal: {
      provider: "digitalocean",
      region: "sfo3",
      markupMonthly: COMPUTE_MARKUP_MONTHLY,
    },
    tiers: Object.entries(doPricing).map(([slug, info]) => ({
      slug,
      vcpus: info.vcpus,
      memoryMB: info.memoryMB,
      diskGB: info.diskGB,
      priceMonthly: roundPrice(info.priceMonthly + COMPUTE_MARKUP_MONTHLY),
      priceHourly: roundPrice((info.priceMonthly + COMPUTE_MARKUP_MONTHLY) / 720),
      centsPerHour: Math.ceil(((info.priceMonthly + COMPUTE_MARKUP_MONTHLY) / 720) * 100),
      _internal: {
        basePriceMonthly: info.priceMonthly,
        basePriceHourly: info.priceHourly,
      },
    })),
    presets: computePresets.map((p) => {
      const info = doPricing[p.slug] || doFallbackPrices[p.slug];
      const monthly = info.priceMonthly + COMPUTE_MARKUP_MONTHLY;
      return {
        ...p,
        vcpus: info.vcpus,
        memoryGB: Math.round(info.memoryMB / 1024),
        diskGB: info.diskGB,
        priceMonthly: roundPrice(monthly),
        priceHourly: roundPrice(monthly / 720),
        centsPerHour: Math.ceil((monthly / 720) * 100),
      };
    }),
  };

  // 4. Provider summary for frontend.
  const providerCounts = {};
  for (const m of allThirdParty) {
    if (!providerCounts[m.provider]) {
      providerCounts[m.provider] = { total: 0, free: 0, paid: 0 };
    }
    providerCounts[m.provider].total++;
    if (m.isFree) providerCounts[m.provider].free++;
    else providerCounts[m.provider].paid++;
  }

  // 5. Build Hanzo Cloud plans (customer-facing — no provider details).
  const cloud = {
    plans: cloudPlans.map((plan) => {
      const hourly = Math.round((plan.priceMonthly / 720) * 10000) / 10000;
      // Strip internal fields before exposing
      const { freeTier, popular, ...rest } = plan;
      return {
        ...rest,
        priceHourly: hourly,
        centsPerHour: Math.ceil(hourly * 100),
        ...(freeTier && { freeTier }),
        ...(popular && { popular }),
      };
    }),
    regions: cloudRegions,
    blockStorage: {
      pricePerGBMonthly: blockStoragePricing.pricePerGBMonthly,
      minSizeGB: blockStoragePricing.minSizeGB,
      maxSizeGB: blockStoragePricing.maxSizeGB,
    },
    // Internal routing data — kept in memory for backend, NOT in API response
    _internal: { providerCosts, planRouting },
  };

  // 6. Build final pricing response.
  const pricingData = {
    updated: new Date().toISOString(),
    summary: {
      catalogMode: ENABLE_OPENROUTER ? "all-providers" : "do-first",
      zenModels: zenModelCount,
      doAiModels: doAiModelCount,
      ensoModels: ensoModelCount,
      thirdPartyModels: thirdPartyModels.length,
      openRouterModels: allOpenRouter.length,
      huggingfaceModels: hfModels.length,
      freeModels: free.length,
      featuredModels: featured.length,
      providers: Object.keys(providerCounts).length,
      totalModels: pricedHanzo.length + thirdPartyModels.length,
      cloudPlans: cloudPlans.length,
      cloudRegions: cloudRegions.length,
    },
    hanzoModels: pricedHanzo,
    families: zenFamilies,
    thirdPartyModels,
    freeModels: free.map((m) => m.id),
    providers: providerCounts,
    tools: toolPricing,
    infrastructure: {
      compute,
      gpu: gpuTiers,
    },
    cloud,
  };

  // Ensure data directory exists.
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(pricingData, null, 2) + "\n");

  console.log(`[sync] Wrote pricing data to ${DATA_FILE}`);
  console.log(`[sync] Updated: ${pricingData.updated}`);
  console.log(
    `[sync] Mode: ${ENABLE_OPENROUTER ? "all-providers" : "DO-first"} | Zen: ${zenModelCount} | do-ai: ${doAiModelCount} | Third-party: ${thirdPartyModels.length} (OpenRouter: ${allOpenRouter.length}, HuggingFace: ${hfModels.length}) | Free: ${free.length} | Total: ${pricingData.summary.totalModels}`
  );
  console.log(`[sync] Providers: ${Object.keys(providerCounts).length}`);

  return pricingData;
}

// When run as a standalone script.
if (process.argv[1] && process.argv[1].endsWith("sync.mjs")) {
  sync()
    .then((data) => {
      console.log("[sync] Done.");
      console.log(`[sync] Summary: ${JSON.stringify(data.summary)}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error("[sync] FATAL:", err.message);
      process.exit(1);
    });
}
