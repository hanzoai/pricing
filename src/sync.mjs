// Sync pricing data: Zen prices from zen-gateway, ALL third-party from OpenRouter.
//
// No hardcoded model lists for third-party — everything detected dynamically.
//
// Usage:
//   node src/sync.mjs          # run standalone
//   import { sync } from './sync.mjs'  # call from server

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  zenCatalog,
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

// Zen gateway internal endpoint — single source of truth for Zen pricing.
const ZEN_GATEWAY_URL =
  process.env.ZEN_GATEWAY_URL ||
  "http://zen-gateway.zen.svc.cluster.local:4100";
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

/**
 * Fetch Zen model pricing from zen-gateway /model/info endpoint.
 * Returns a Map of model_name → { input, output } in $/MTok.
 */
async function fetchZenPricing() {
  const url = `${ZEN_GATEWAY_URL}/model/info`;
  const headers = {};
  if (ZEN_MASTER_KEY) {
    headers["Authorization"] = `Bearer ${ZEN_MASTER_KEY}`;
  }

  console.log(`[sync] Fetching Zen pricing...`);
  const res = await fetchWithTimeout(url, { headers });
  if (!res.ok) {
    throw new Error(`Zen gateway returned ${res.status}`);
  }

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

  console.log(`[sync] Got pricing for ${pricing.size} Zen models.`);
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
  // 1. Fetch Zen pricing from gateway (single source of truth).
  const zenPricing = await fetchZenPricing();

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
  const allThirdParty = orModels.map((m) => processOpenRouterModel(m, markup));

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
      freeModels: free.length,
      featuredModels: featured.length,
      providers: Object.keys(providerCounts).length,
      totalModels: pricedHanzo.length + thirdPartyModels.length,
      cloudPlans: cloudPlans.length,
      cloudRegions: cloudRegions.length,
    },
    hanzoModels: pricedHanzo,
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
    `[sync] Zen: ${pricedHanzo.length} | Third-party: ${thirdPartyModels.length} (${free.length} free) | Total: ${pricingData.summary.totalModels}`
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
