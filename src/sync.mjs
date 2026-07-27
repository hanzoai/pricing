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
const DATASTORE_FILE = join(__dirname, "..", "datastore.json");

// ── Commerce catalog — the product/pricing source of truth ──────────────
// The infra tiers (cloud VM plans, GPU tiers, managed-datastore tiers) live in
// commerce's catalog and are READ from GET /v1/commerce/catalog?brand=infra, so
// there is exactly ONE place a price or spec is edited. If commerce is
// unreachable we FALL BACK to the hardcoded models.mjs/datastore.json copy so
// pricing never goes empty — the cutover is safe and reversible. In-cluster set
// COMMERCE_CATALOG_URL=http://commerce.hanzo.svc:8001/v1/commerce/catalog.
const COMMERCE_CATALOG_URL =
  process.env.COMMERCE_CATALOG_URL || "https://api.hanzo.ai/v1/commerce/catalog";

// loadDatastoreFallback reads the hardcoded managed-datastore price list. It is
// the offline copy behind the commerce read: the static envelope
// (schema/trial/discounts/included/endpoints) always comes from here, and the
// whole thing serves when commerce is unreachable.
function loadDatastoreFallback() {
  return JSON.parse(readFileSync(DATASTORE_FILE, "utf-8"));
}

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

// enso serves the Enso family and owns its STRUCTURE — which SKUs exist, at what
// context window, in what mode. Same wire shape as zen, same env names ai uses.
// A hardcoded Enso roster had drifted on both counts: it listed enso-flash at a
// 1M window against a served 262144, and enso-ultra at 200K against a served 1M.
const ENSO_URL = process.env.ENSO_URL || "http://enso.enso.svc.cluster.local:8080";
const ENSO_KEY = process.env.ENSO_API_KEY || "";

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

// BRANDS holds only the vendor names that CANNOT be derived from their slug:
// acronyms and camelCase (xAI, NVIDIA, OpenAI), a vendor whose org slug names a
// PRODUCT rather than the company (meta-llama is Meta, ibm-granite is IBM), and a
// vendor whose slug is not its name at all (z-ai is Zhipu).
//
// It is deliberately NOT a roster of every vendor. Every slug absent from it still
// renders as a presentable name via vendorName() below, so a vendor we have never
// seen arrives correctly named with no edit here. The previous map WAS the roster —
// its `names[slug] || slug` fallback leaked raw slugs (ai21, anthracite-org,
// bytedance-seed, ~anthropic) into the public catalog for every vendor nobody had
// hand-added yet, which is the same rot as a hardcoded model list.
const BRANDS = {
  ai21: "AI21",
  aisingapore: "AI Singapore",
  allenai: "Allen AI",
  "arcee-ai": "Arcee",
  bytedance: "ByteDance",
  "bytedance-seed": "ByteDance",
  coherelabs: "Cohere",
  "deepreinforce-ai": "DeepReinforce",
  deepcogito: "DeepCogito",
  deepseek: "DeepSeek",
  "deepseek-ai": "DeepSeek",
  "ibm-granite": "IBM",
  inclusionai: "InclusionAI",
  "meta-llama": "Meta",
  minimax: "MiniMax",
  mistralai: "Mistral",
  moonshotai: "Moonshot",
  nousresearch: "Nous Research",
  nvidia: "NVIDIA",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  rekaai: "Reka",
  sao10k: "Sao10K",
  stepfun: "StepFun",
  thedrummer: "TheDrummer",
  thinkingmachines: "Thinking Machines",
  undi95: "Undi95",
  "x-ai": "xAI",
  "z-ai": "Zhipu",
  "zai-org": "Zhipu",
};

// Registry artifacts — part of an org's SLUG but never part of its name, because a
// registry needed the handle to be unique. "anthracite-org" is Anthracite.
//
// "ai" and "labs" are deliberately NOT here: Swiss AI, Liquid AI and Arcee AI are
// what those companies are actually called, so dropping the token would rename the
// vendor rather than tidy it. TOKENS below just renders them correctly.
const SUFFIXES = new Set(["org", "inc"]);

// Tokens whose correct rendering is not a capitalized first letter.
const TOKENS = { ai: "AI", agi: "AGI", ml: "ML", hq: "HQ" };

/**
 * The ONE vendor namer. Turns any catalog id into the plain name of the company
 * that MADE the model — "Meta", never "Meta Llama"; the vendor, never the product.
 *
 * Handles every id dialect in the catalog with one rule, because they differ only
 * in what precedes the org slug:
 *   "meta-llama/llama-4-scout"          -> Meta      (OpenRouter)
 *   "~anthropic/claude-opus-latest"      -> Anthropic (OpenRouter floating alias)
 *   "huggingface/CohereLabs/aya-vision"  -> Cohere    (HuggingFace router)
 *   "openrouter/auto"                    -> OpenRouter
 *
 * An unknown slug is DERIVED rather than passed through raw, so the catalog never
 * shows a machine identifier to a human and a new vendor needs no code change.
 */
export function vendorName(id) {
  let slug = String(id || "").trim();
  if (!slug) return "";
  // HuggingFace router ids carry the HOST first; the vendor is the org after it.
  if (slug.toLowerCase().startsWith("huggingface/")) slug = slug.slice("huggingface/".length);
  // "~vendor/model-latest" is OpenRouter's floating-alias namespace. The tilde is
  // routing syntax, not part of the vendor — without stripping it, Anthropic's
  // always-current SKUs group under a separate "~anthropic" vendor.
  slug = slug.replace(/^~/, "").split("/")[0].trim();
  if (!slug) return "";

  const key = slug.toLowerCase();
  if (BRANDS[key]) return BRANDS[key];

  // Derive: drop a registry artifact, then render each token.
  const words = key.split(/[-_.]+/).filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop();
  const derived = words
    .map((w) => TOKENS[w] || w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return derived || slug;
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
async function fetchFamily(label, baseUrl, key) {
  const headers = key ? { Authorization: `Bearer ${key}` } : {};
  const url = `${baseUrl}/v1/models`;
  console.log(`[sync] Fetching ${label} family from ${url}...`);

  const res = await fetchWithTimeout(url, { headers }, 15_000);
  if (!res.ok) {
    throw new Error(`${label} /v1/models returned ${res.status}`);
  }
  const models = (await res.json()).data || [];
  if (models.length === 0) {
    throw new Error(`${label} /v1/models carried no model`);
  }
  console.log(`[sync] ${label} serves ${models.length} models.`);
  return models;
}

const fetchZenFamily = () => fetchFamily("Zen", ZEN_URL, ZEN_KEY);
const fetchEnsoFamily = () => fetchFamily("Enso", ENSO_URL, ENSO_KEY);

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
      // Zen is OURS: its own family, grouped as itself and never as a vendor's
      // product line. `family` is what a surface groups by; it is set here, at the
      // one place a Zen SKU is built, so no consumer has to know a name prefix.
      family: "zen",
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
    // The vendor is who MADE the model, not who hosts the inference. HuggingFace is
    // the host and says so in `features`; labelling all 60 "HuggingFace" hid Cohere,
    // DeepSeek, Qwen and Meta behind a serving platform.
    provider: vendorName(hfModel.id),
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

// do-ai specialty ids carry no org prefix, so the vendor is read from the id's
// leading token where the id names its maker. These are open models we HOST, not
// models we made: labelling stable-diffusion or gpt-image "Hanzo" claimed someone
// else's work as ours, which is the same defect as "Meta Llama" pointed the other
// way. An id that names no maker (router:*) keeps "Hanzo" — we do serve those.
const DO_AI_VENDORS = [
  ["openai-", "OpenAI"],
  ["qwen", "Qwen"],
  ["stable-diffusion", "Stability AI"],
  ["bge-", "BAAI"],
  ["gte-", "Alibaba"],
  ["wan2", "Alibaba"],
  ["e5-", "Microsoft"],
];

function doAiVendor(id) {
  const k = String(id || "").toLowerCase();
  for (const [prefix, vendor] of DO_AI_VENDORS) if (k.startsWith(prefix)) return vendor;
  return "Hanzo";
}

/**
 * Process a do-ai utility model into a Hanzo-HOSTED catalog entry, shaped like a
 * zenCatalog entry. It carries no `family`: hosting a model does not make it ours.
 */
function processDoAiModel(m, k) {
  const entry = {
    name: m.id,
    provider: doAiVendor(m.id),
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
    provider: vendorName(orModel.id),
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
 * Infra catalog rows of one category, ordered by the catalog `order` field.
 */
function pickInfra(catalog, category) {
  return (catalog.products || [])
    .filter((p) => p.category === category)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/**
 * Map commerce `cloud` catalog rows back into the cloudPlans[] shape sync builds
 * `data.cloud.plans` from — byte-for-byte the local models.mjs cloudPlans entry
 * (id/name/description/vcpus/memoryGB/diskGB/cpuType/maxVMs/priceMonthly/features
 * + optional freeTier/popular). The existing builder then derives priceHourly.
 */
function mapCommerceCloudPlans(catalog) {
  return pickInfra(catalog, "cloud").map((p) => {
    const m = p.metadata || {};
    const plan = {
      id: m.id,
      name: p.name,
      description: p.description,
      vcpus: m.vcpus,
      memoryGB: m.memoryGB,
      diskGB: m.diskGB,
      cpuType: m.cpuType,
      maxVMs: m.maxVMs,
      priceMonthly: m.priceMonthly,
      features: m.features,
    };
    if (m.freeTier) plan.freeTier = m.freeTier;
    if (m.popular) plan.popular = m.popular;
    return plan;
  });
}

/**
 * Map commerce `gpu` catalog rows back into the gpuTiers[] shape (name/gpu/vram/
 * price) sync exposes as `infrastructure.gpu`.
 */
function mapCommerceGpuTiers(catalog) {
  return pickInfra(catalog, "gpu").map((p) => {
    const m = p.metadata || {};
    return { name: p.name, gpu: m.gpu, vram: m.vram, price: m.price };
  });
}

/**
 * Map commerce `datastore` catalog rows back into the datastore.json shape the
 * /v1/pricing/datastore endpoint emits. Commerce owns the TIERS (prices/specs)
 * and the usage RATES (carried on the tier metadata); the static envelope
 * (schema/currency/unit/note/trial/discounts/included/endpoints) is product
 * policy, not per-tier pricing, so it stays in the local datastore.json.
 */
function mapCommerceDatastore(catalog, fallback) {
  const rows = pickInfra(catalog, "datastore");
  const tiers = rows.map((p) => {
    const m = p.metadata || {};
    const tier = {
      id: m.id,
      name: p.name,
      tagline: m.tagline,
      replicas: m.replicas,
      ramGiB: m.ramGiB,
      vcpu: m.vcpu,
      storageGB: m.storageGB ?? null,
      priceMonthly: m.priceMonthly,
      priceHourly: m.priceHourly,
      billingGranularity: m.billingGranularity,
      availabilityZones: m.availabilityZones,
      storageLimit: m.storageLimit,
    };
    if (m.popular) tier.popular = m.popular;
    tier.support = m.support;
    tier.features = m.features;
    if (m.contactSales) tier.contactSales = m.contactSales;
    return tier;
  });
  const usage = rows[0]?.metadata?.usage || fallback.usage;
  return { ...fallback, tiers, usage };
}

/**
 * Fetch the infra tiers from commerce (the product/pricing SOT). Returns
 * { cloud, gpu, datastore } mapped into the shapes the pricing endpoints emit,
 * or null on any failure/timeout/empty so the caller falls back to the hardcoded
 * copy. Never throws — pricing must never go empty because commerce is down.
 */
async function fetchCommerceInfra() {
  const url = `${COMMERCE_CATALOG_URL}?brand=infra`;
  try {
    const res = await fetchWithTimeout(url, {}, 10_000);
    if (!res.ok) {
      console.warn(`[sync] commerce catalog ${url} returned ${res.status} — using hardcoded infra fallback`);
      return null;
    }
    const body = await res.json();
    if (!Array.isArray(body.products) || body.products.length === 0) {
      console.warn("[sync] commerce catalog carried no infra products — using hardcoded fallback");
      return null;
    }
    const cloud = mapCommerceCloudPlans(body);
    const gpu = mapCommerceGpuTiers(body);
    const datastore = mapCommerceDatastore(body, loadDatastoreFallback());
    if (cloud.length === 0 || gpu.length === 0 || datastore.tiers.length === 0) {
      console.warn("[sync] commerce catalog missing an infra section — using hardcoded fallback");
      return null;
    }
    return { cloud, gpu, datastore };
  } catch (err) {
    console.warn(`[sync] commerce catalog fetch failed: ${err.message} — using hardcoded infra fallback`);
    return null;
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
  // Enso is OURS and is its OWN family, separate from Zen — never folded in with it
  // and never described in terms of an upstream model. Its ROSTER and windows are
  // read from the service that serves it, so the list cannot go stale and a SKU enso
  // does not serve cannot be invented; the PRICE stays ours (ensoCatalog). If enso
  // is unreachable we fall back to the catalog copy rather than dropping the family.
  let ensoModels;
  try {
    ensoModels = buildEnsoModels(await fetchEnsoFamily(), ensoCatalog);
  } catch (err) {
    console.warn(`[sync] enso unreachable (${err.message}) — using catalog copy`);
    ensoModels = ensoCatalog.map((em) => ({ ...em, family: "enso", owned_by: "hanzo" }));
  }
  for (const em of ensoModels) pricedHanzo.push(em);
  const ensoModelCount = ensoModels.length;

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

  // 4b. Resolve the infra tiers (cloud VM plans, GPU tiers, datastore tiers)
  // from commerce — the product/pricing source of truth — and fall back to the
  // hardcoded models.mjs/datastore.json copy if commerce is unreachable, so
  // pricing never goes empty. Only these three sections switch source; the live
  // model aggregation (Zen/do-ai/OpenRouter/HF) is untouched.
  const commerceInfra = await fetchCommerceInfra();
  const infraSource = commerceInfra ? "commerce" : "fallback(models.mjs+datastore.json)";
  const cloudPlansSource = commerceInfra ? commerceInfra.cloud : cloudPlans;
  const gpuTiersSource = commerceInfra ? commerceInfra.gpu : gpuTiers;
  const datastoreSource = commerceInfra ? commerceInfra.datastore : loadDatastoreFallback();
  console.log(
    `[sync] Infra tiers source: ${infraSource} (cloud:${cloudPlansSource.length} gpu:${gpuTiersSource.length} datastore:${datastoreSource.tiers.length})`
  );

  // 5. Build Hanzo Cloud plans (customer-facing — no provider details).
  const cloud = {
    plans: cloudPlansSource.map((plan) => {
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
      cloudPlans: cloudPlansSource.length,
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
      gpu: gpuTiersSource,
    },
    cloud,
    // Managed-datastore tiers + usage rates (from commerce, or the datastore.json
    // fallback). Served by GET /v1/pricing/datastore.
    datastore: datastoreSource,
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

/**
 * The ONE public view of a model WE serve (Zen, Enso, and the open models we host).
 *
 * `provider` is the plain vendor name a surface groups by; `family` marks the two
 * families that are OURS so they can lead a list without any consumer hardcoding a
 * name prefix. Both endpoints project through this, so /v1/models and
 * /v1/pricing/models can never disagree about who made a model.
 *
 * It used to be `{...m, provider: "Hanzo", category: "zen"}` — one label stamped
 * over Zen, Enso and 18 hosted open models alike, which both hid our two families
 * inside a single bucket and claimed Stability's and OpenAI's models as ours.
 */
export function hanzoModelView(m) {
  return {
    ...m,
    provider: m.family === "zen" ? "Zen" : m.family === "enso" ? "Enso" : m.provider || "Hanzo",
    category: m.family || m.category || "specialty",
  };
}

/**
 * The Enso family as this catalog renders it: every SKU enso SERVES, at the window
 * enso serves it, with our branded copy and our retail price grafted on.
 *
 * This is the seam the two sides own separately, and neither duplicates the other:
 * the family owns its STRUCTURE — which SKUs exist, their context window, their
 * mode — and publishes it on its wire; we own the NUMBER. So a SKU appears here iff
 * enso serves it (enso-pro was listed for months and 404s at the service; a roster
 * read from the service cannot invent one), while the price stays ours to set and
 * is not silently rewritten by an upstream change.
 *
 * A SKU enso serves that we have no price for falls back to the family's own rate
 * rather than listing unpriced — an unpriced, selectable model is a billing hole.
 */
export function buildEnsoModels(liveModels, metaCatalog = []) {
  const meta = new Map(metaCatalog.map((m) => [normalizeModelName(m.name), m]));
  return liveModels.map((em) => {
    const m = meta.get(normalizeModelName(em.id)) || {};
    return {
      name: em.id,
      // Enso is OURS and is its OWN family — never folded in with Zen, and never
      // described in terms of an upstream model.
      family: "enso",
      owned_by: "hanzo",
      fullName: m.fullName || brandName(em.id),
      description: m.description || "",
      features: m.features || [],
      tier: m.tier || "",
      // The served window, from the service that serves it.
      context: em.context_window || m.context || null,
      pricing: m.pricing || {
        input: numOrNull(em.pricing?.input),
        output: numOrNull(em.pricing?.output),
        cacheRead: numOrNull(em.pricing?.cache_read),
        cacheWrite: null,
      },
    };
  });
}
