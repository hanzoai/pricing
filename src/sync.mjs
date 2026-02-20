// Sync pricing data from OpenRouter API, apply markup, and write to data/pricing.json.
//
// Usage:
//   node src/sync.mjs          # run standalone
//   import { sync } from './sync.mjs'  # call from server

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKUP,
  ZEN_MULTIPLIER,
  hanzoModels,
  thirdPartyModels,
  toolPricing,
  computeTiers,
  gpuTiers,
} from "./models.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DATA_FILE = join(DATA_DIR, "pricing.json");

const OPENROUTER_API = "https://openrouter.ai/api/v1/models";

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
 * Convert OpenRouter per-token price string to $/MTok with markup.
 */
function toMTok(perTokenStr, markup) {
  if (perTokenStr == null || perTokenStr === "") return null;
  const perToken = parseFloat(perTokenStr);
  if (isNaN(perToken)) return null;
  return roundPrice(perToken * 1_000_000 * markup);
}

/**
 * Fetch model list from OpenRouter.
 */
async function fetchOpenRouterModels() {
  const res = await fetch(OPENROUTER_API);
  if (!res.ok) {
    throw new Error(
      `OpenRouter API returned ${res.status}: ${await res.text()}`
    );
  }
  const body = await res.json();
  return body.data || [];
}

/**
 * Run the full sync: fetch from OpenRouter, compute pricing, write to disk.
 * Returns the pricing object.
 */
export async function sync() {
  console.log("[sync] Fetching models from OpenRouter...");
  const orModels = await fetchOpenRouterModels();
  console.log(`[sync] Received ${orModels.length} models from OpenRouter.`);

  // Build lookup by ID.
  const orLookup = new Map();
  for (const m of orModels) {
    orLookup.set(m.id, m);
  }

  // Process third-party models.
  const pricedThirdParty = [];
  for (const model of thirdPartyModels) {
    const or = orLookup.get(model.openrouterId);
    if (!or) {
      console.warn(
        `[sync] WARN: OpenRouter model not found: ${model.openrouterId}`
      );
      pricedThirdParty.push({
        ...model,
        contextWindow: null,
        pricing: { input: null, output: null, cacheRead: null, cacheWrite: null },
        openrouterAvailable: false,
      });
      continue;
    }

    const pricing = or.pricing || {};
    pricedThirdParty.push({
      name: model.name,
      openrouterId: model.openrouterId,
      features: model.features,
      contextWindow: or.context_length || null,
      pricing: {
        input: toMTok(pricing.prompt, MARKUP),
        output: toMTok(pricing.completion, MARKUP),
        cacheRead: toMTok(pricing.input_cache_read, MARKUP),
        cacheWrite: toMTok(pricing.input_cache_write, MARKUP),
      },
      openrouterAvailable: true,
    });
  }

  // Process Hanzo Zen models.
  // Zen pricing = fireworksCost * ZEN_MULTIPLIER (hardcoded from gateway config).
  const pricedHanzo = [];
  for (const model of hanzoModels) {
    const fc = model.fireworksCost;
    pricedHanzo.push({
      name: model.name,
      fullName: model.fullName,
      description: model.description,
      features: model.features,
      tier: model.tier,
      upstream: model.upstream,
      pricing: {
        input: roundPrice(fc.input * ZEN_MULTIPLIER),
        output: roundPrice(fc.output * ZEN_MULTIPLIER),
        cacheRead: null,
        cacheWrite: null,
      },
    });
  }

  const pricingData = {
    markup: MARKUP,
    zenMultiplier: ZEN_MULTIPLIER,
    updated: new Date().toISOString(),
    hanzoModels: pricedHanzo,
    thirdPartyModels: pricedThirdParty,
    tools: toolPricing,
    infrastructure: {
      compute: computeTiers,
      gpu: gpuTiers,
    },
  };

  // Ensure data directory exists.
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(pricingData, null, 2) + "\n");
  console.log(`[sync] Wrote pricing data to ${DATA_FILE}`);
  console.log(`[sync] Updated: ${pricingData.updated}`);
  console.log(
    `[sync] Hanzo models: ${pricedHanzo.length}, Third-party: ${pricedThirdParty.length}`
  );

  return pricingData;
}

// When run as a standalone script.
if (process.argv[1] && process.argv[1].endsWith("sync.mjs")) {
  sync()
    .then(() => {
      console.log("[sync] Done.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[sync] FATAL:", err.message);
      process.exit(1);
    });
}
