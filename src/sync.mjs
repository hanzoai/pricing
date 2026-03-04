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

// LLM gateway internal endpoint — single source of truth for Zen pricing.
// The gateway is a LiteLLM proxy; /model/info returns per-model cost data.
const ZEN_GATEWAY_URL =
  process.env.ZEN_GATEWAY_URL ||
  "http://gateway.hanzo.svc:8080";
const ZEN_MASTER_KEY = process.env.ZEN_MASTER_KEY || "";

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

// ── Static fallback pricing ($/MTok) for Zen token-based models ──────
// Used when the LLM gateway /model/info is unreachable.
// Prices aligned with competitive LLM market rates by tier.
const ZEN_FALLBACK_PRICING = {
  // Zen4 Generation
  "zen4":              { input: 1.50,  output: 4.50,  cacheRead: 0.38,  cacheWrite: 1.88 },
  "zen4-ultra":        { input: 2.00,  output: 6.00,  cacheRead: 0.50,  cacheWrite: 2.50 },
  "zen4-pro":          { input: 0.80,  output: 2.40,  cacheRead: 0.20,  cacheWrite: 1.00 },
  "zen4-max":          { input: 3.00,  output: 12.00, cacheRead: 0.75,  cacheWrite: 3.75 },
  "zen4.1":            { input: 2.00,  output: 8.00,  cacheRead: 0.50,  cacheWrite: 2.50 },
  "zen4-mini":         { input: 0.10,  output: 0.40,  cacheRead: 0.03,  cacheWrite: 0.13 },
  "zen4-thinking":     { input: 1.50,  output: 6.00,  cacheRead: 0.38,  cacheWrite: 1.88 },
  // Zen4 Code
  "zen4-coder":        { input: 1.00,  output: 3.00,  cacheRead: 0.25,  cacheWrite: 1.25 },
  "zen4-coder-pro":    { input: 2.00,  output: 6.00,  cacheRead: 0.50,  cacheWrite: 2.50 },
  "zen4-coder-flash":  { input: 0.30,  output: 0.90,  cacheRead: 0.08,  cacheWrite: 0.38 },
  // Zen3 Chat
  "zen3-omni":         { input: 1.50,  output: 4.50,  cacheRead: null,  cacheWrite: null },
  "zen3-vl":           { input: 0.60,  output: 1.80,  cacheRead: null,  cacheWrite: null },
  "zen3-nano":         { input: 0.05,  output: 0.15,  cacheRead: null,  cacheWrite: null },
  "zen3-guard":        { input: 0.10,  output: 0.10,  cacheRead: null,  cacheWrite: null },
  // Zen3 Embedding (per MTok, not per image/minute)
  "zen3-embedding":          { input: 0.10,  output: null, cacheRead: null, cacheWrite: null },
  "zen3-embedding-medium":   { input: 0.05,  output: null, cacheRead: null, cacheWrite: null },
  "zen3-embedding-small":    { input: 0.02,  output: null, cacheRead: null, cacheWrite: null },
  "zen3-embedding-openai":   { input: 0.10,  output: null, cacheRead: null, cacheWrite: null },
  // Zen3 Reranker (per MTok)
  "zen3-reranker":           { input: 0.10,  output: null, cacheRead: null, cacheWrite: null },
  "zen3-reranker-medium":    { input: 0.05,  output: null, cacheRead: null, cacheWrite: null },
  "zen3-reranker-small":     { input: 0.02,  output: null, cacheRead: null, cacheWrite: null },
};

/**
 * Fetch Zen model pricing from LLM gateway.
 * Tries /model/info (LiteLLM) first, then /v1/models.
 * Falls back to static pricing if gateway is unreachable.
 * Returns a Map of model_name → { input, output, cacheRead, cacheWrite } in $/MTok.
 */
async function fetchZenPricing() {
  const headers = {};
  if (ZEN_MASTER_KEY) {
    headers["Authorization"] = `Bearer ${ZEN_MASTER_KEY}`;
  }

  // Try /model/info first (LiteLLM endpoint with full pricing data).
  try {
    const url = `${ZEN_GATEWAY_URL}/model/info`;
    console.log(`[sync] Fetching Zen pricing from ${url}...`);
    const res = await fetchWithTimeout(url, { headers }, 15_000);
    if (res.ok) {
      const body = await res.json();
      const models = body.data || [];
      const pricing = new Map();
      for (const m of models) {
        const name = m.model_name;
        const info = m.model_info || {};
        pricing.set(name, {
          input: perTokenToMTok(info.input_cost_per_token),
          output: perTokenToMTok(info.output_cost_per_token),
          cacheRead: perTokenToMTok(info.input_cost_per_token_cache_read),
          cacheWrite: perTokenToMTok(info.input_cost_per_token_cache_write),
        });
      }
      if (pricing.size > 0) {
        console.log(`[sync] Got live pricing for ${pricing.size} Zen models.`);
        return pricing;
      }
    } else {
      console.warn(`[sync] /model/info returned ${res.status} — trying /v1/models`);
    }
  } catch (err) {
    console.warn(`[sync] /model/info failed: ${err.message} — trying /v1/models`);
  }

  // Try /v1/models (OpenAI-compatible, may not have pricing).
  try {
    const url = `${ZEN_GATEWAY_URL}/v1/models`;
    console.log(`[sync] Fetching Zen models from ${url}...`);
    const res = await fetchWithTimeout(url, { headers }, 15_000);
    if (res.ok) {
      const body = await res.json();
      const models = body.data || [];
      console.log(`[sync] Found ${models.length} models on gateway (no per-token pricing in /v1/models — using static fallback).`);
      // /v1/models doesn't include pricing, so fall through to static
    }
  } catch (err) {
    console.warn(`[sync] /v1/models failed: ${err.message}`);
  }

  // Fall back to static pricing.
  console.log(`[sync] Using static fallback pricing for ${Object.keys(ZEN_FALLBACK_PRICING).length} Zen models.`);
  const pricing = new Map();
  for (const [name, prices] of Object.entries(ZEN_FALLBACK_PRICING)) {
    pricing.set(name, { ...prices });
  }
  return pricing;
}

/**
 * Fetch ALL models from OpenRouter API.
 */
async function fetchOpenRouterModels() {
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
  let zenPricing;
  try {
    zenPricing = await fetchZenPricing();
  } catch (err) {
    console.error(`[sync] Zen pricing fetch failed entirely: ${err.message} — using static fallback`);
    zenPricing = new Map();
    for (const [name, prices] of Object.entries(ZEN_FALLBACK_PRICING)) {
      zenPricing.set(name, { ...prices });
    }
  }

  // Build priced Zen models by merging catalog metadata with live pricing.
  const pricedHanzo = [];
  for (const model of zenCatalog) {
    const prices = zenPricing.get(model.name);
    const entry = {
      name: model.name,
      fullName: model.fullName,
      description: model.description,
      features: model.features,
      tier: model.tier,
      context: model.context || null,
      specs: model.specs,
    };

    // Pass through optional metadata.
    if (model.endpoint) entry.endpoint = model.endpoint;
    if (model.contactSales) entry.contactSales = true;

    if (model.contactSales) {
      // Contact-sales models (e.g. zen5) — no pricing exposed.
      entry.pricing = null;
    } else if (model.staticPricing) {
      // Non-token models (image, audio) use static per-unit pricing.
      entry.pricingUnit = model.pricingUnit;
      entry.pricing = { perUnit: model.staticPricing.perUnit };
    } else {
      // Token-based models: merge live gateway pricing.
      entry.pricing = {
        input: prices?.input ?? null,
        output: prices?.output ?? null,
        cacheRead: prices?.cacheRead ?? null,
        cacheWrite: prices?.cacheWrite ?? null,
      };
      if (!prices) {
        console.warn(`[sync] WARN: No pricing from zen-gateway for ${model.name}`);
      }
    }

    pricedHanzo.push(entry);
  }

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
  const compute = {
    provider: "digitalocean",
    region: "sfo3",
    markupMonthly: COMPUTE_MARKUP_MONTHLY,
    tiers: Object.entries(doPricing).map(([slug, info]) => ({
      slug,
      vcpus: info.vcpus,
      memoryMB: info.memoryMB,
      diskGB: info.diskGB,
      basePriceMonthly: info.priceMonthly,
      basePriceHourly: info.priceHourly,
      priceMonthly: roundPrice(info.priceMonthly + COMPUTE_MARKUP_MONTHLY),
      priceHourly: roundPrice((info.priceMonthly + COMPUTE_MARKUP_MONTHLY) / 720),
      centsPerHour: Math.ceil(((info.priceMonthly + COMPUTE_MARKUP_MONTHLY) / 720) * 100),
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
      zenModels: pricedHanzo.length,
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
    `[sync] Zen: ${pricedHanzo.length} | Third-party: ${thirdPartyModels.length} (OpenRouter: ${allOpenRouter.length}, HuggingFace: ${hfModels.length}) | Free: ${free.length} | Total: ${pricingData.summary.totalModels}`
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
