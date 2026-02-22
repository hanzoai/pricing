// Sync pricing data: Zen prices from zen-gateway, third-party from OpenRouter.
//
// Usage:
//   node src/sync.mjs          # run standalone
//   import { sync } from './sync.mjs'  # call from server

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  zenCatalog,
  thirdPartyModels,
  toolPricing,
  computeTiers,
  gpuTiers,
} from "./models.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DATA_FILE = join(DATA_DIR, "pricing.json");

const OPENROUTER_API = "https://openrouter.ai/api/v1/models";

// Zen gateway internal endpoint — single source of truth for Zen pricing.
const ZEN_GATEWAY_URL =
  process.env.ZEN_GATEWAY_URL ||
  "http://zen-gateway.zen.svc.cluster.local:4100";
const ZEN_MASTER_KEY = process.env.ZEN_MASTER_KEY || "";

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
 * Fetch Zen model pricing from zen-gateway /model/info endpoint.
 * Returns a Map of model_name → { input, output } in $/MTok.
 */
async function fetchZenPricing() {
  const url = `${ZEN_GATEWAY_URL}/model/info`;
  const headers = {};
  if (ZEN_MASTER_KEY) {
    headers["Authorization"] = `Bearer ${ZEN_MASTER_KEY}`;
  }

  console.log(`[sync] Fetching Zen pricing from ${url}...`);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(
      `Zen gateway /model/info returned ${res.status}: ${await res.text()}`
    );
  }

  const body = await res.json();
  // LiteLLM /model/info returns { data: [ { model_name, model_info: { input_cost_per_token, ... } } ] }
  const models = body.data || [];
  const pricing = new Map();

  for (const m of models) {
    const name = m.model_name;
    const info = m.model_info || {};
    pricing.set(name, {
      input: perTokenToMTok(info.input_cost_per_token),
      output: perTokenToMTok(info.output_cost_per_token),
    });
  }

  console.log(`[sync] Got pricing for ${pricing.size} Zen models.`);
  return pricing;
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
 * Compute markup from OpenRouter base prices.
 * Markup is kept server-side only and not exposed in the API response.
 */
function getThirdPartyMarkup() {
  return parseFloat(process.env.THIRD_PARTY_MARKUP || "1.20");
}

/**
 * Run the full sync: fetch from zen-gateway + OpenRouter, write to disk.
 * Returns the pricing object.
 */
export async function sync() {
  // Fetch Zen pricing from gateway (single source of truth).
  const zenPricing = await fetchZenPricing();

  // Build priced Zen models by merging catalog metadata with live pricing.
  const pricedHanzo = [];
  for (const model of zenCatalog) {
    const prices = zenPricing.get(model.name);
    pricedHanzo.push({
      name: model.name,
      fullName: model.fullName,
      description: model.description,
      features: model.features,
      tier: model.tier,
      specs: model.specs,
      pricing: {
        input: prices?.input ?? null,
        output: prices?.output ?? null,
        cacheRead: null,
        cacheWrite: null,
      },
    });
    if (!prices) {
      console.warn(`[sync] WARN: No pricing from zen-gateway for ${model.name}`);
    }
  }

  // Fetch third-party pricing from OpenRouter.
  console.log("[sync] Fetching models from OpenRouter...");
  const orModels = await fetchOpenRouterModels();
  console.log(`[sync] Received ${orModels.length} models from OpenRouter.`);

  const markup = getThirdPartyMarkup();
  const orLookup = new Map();
  for (const m of orModels) {
    orLookup.set(m.id, m);
  }

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
        input: toMTok(pricing.prompt, markup),
        output: toMTok(pricing.completion, markup),
        cacheRead: toMTok(pricing.input_cache_read, markup),
        cacheWrite: toMTok(pricing.input_cache_write, markup),
      },
      openrouterAvailable: true,
    });
  }

  const pricingData = {
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
