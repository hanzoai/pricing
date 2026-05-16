// Hanzo pricing API server.
//
// Endpoints:
//   GET  /health                        — health check
//   GET  /v1/pricing                    — full pricing data (all models, tools, infra)
//   GET  /v1/pricing/models             — all models (hanzo + third-party) with pricing
//   GET  /v1/pricing/model/:name        — single model lookup (case-insensitive, matches name or id)
//   GET  /v1/pricing/summary            — model counts and provider breakdown
//   GET  /v1/pricing/free               — free models only
//   GET  /v1/pricing/featured           — featured third-party models only
//   GET  /v1/pricing/compute            — DO-backed compute tiers with markup
//   GET  /v1/pricing/compute/presets    — curated compute presets for LaunchPage
//   GET  /v1/pricing/cloud              — cloud VM resale plans (multi-provider)
//   GET  /v1/pricing/cloud/plans        — cloud plans only (for pricing page)
//   GET  /v1/pricing/cloud/regions      — available cloud regions
//   GET  /v1/pricing/cloud/storage      — block storage pricing
//   GET  /v1/pricing/providers          — provider breakdown with counts
//   GET  /v1/pricing/subscriptions      — subscription plans (from @hanzo/plans)
//   GET  /v1/pricing/blockchain         — blockchain / RPC plans (from @hanzo/plans)
//   GET  /v1/pricing/iam               — IAM / identity plans (from @hanzo/plans)
//   GET  /v1/pricing/policy             — transparent pricing policy + revenue sharing
//
// Convenience aliases:
//   GET  /v1/models                     — OpenAI-compatible model listing
//   GET  /v1/plans                      — subscription plans
//   GET  /v1/subscriptions              — subscription plans (alias)
//   GET  /v1/cloud                      — cloud VM plans + regions + storage
//   GET  /v1/tools                      — tool pricing
//   GET  /v1/gpu                        — GPU tier pricing
//   GET  /v1/pricing-policy             — transparent pricing policy
//   GET  /v1/iam                        — IAM / identity plans
//
//   POST /v1/sync                       — trigger manual sync (requires PRICING_API_KEY)

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { sync } from "./sync.mjs";
import {
  subscriptionPlans, blockchainPlans, pricingPolicy,
  canonicalCloudPlans, canonicalGpuTiers, canonicalRegions,
  canonicalStorage, canonicalTools, iamPlans,
  basePlans, paasPlans,
} from "./models.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "pricing.json");

const PORT = parseInt(process.env.PORT || "8080", 10);
const API_KEY = process.env.PRICING_API_KEY || "";

// Sync interval: 6 hours.
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

// In-memory cache so we don't hit disk on every request.
let _cache = null;

function invalidateCache() {
  _cache = null;
}

/**
 * Load pricing data from disk (cached).
 */
function loadPricing() {
  if (_cache) return _cache;
  if (!existsSync(DATA_FILE)) {
    return null;
  }
  try {
    _cache = JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch (err) {
    console.error("[server] Failed to parse pricing data:", err.message);
    return null;
  }
  return _cache;
}

const app = express();
app.use(express.json());

// CORS for frontend.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Root.
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "pricing.hanzo.ai", version: "1.0.0" });
});

// Health check.
app.get("/health", (_req, res) => {
  const data = loadPricing();
  res.json({
    status: "ok",
    lastSync: data?.updated || null,
    models: data?.summary || null,
  });
});

// Full pricing data (strips internal cost/routing data).
app.get("/v1/pricing", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  // Strip internal provider routing from cloud section.
  if (data.cloud) {
    const { _internal, ...publicCloud } = data.cloud;
    return res.json({ ...data, cloud: publicCloud });
  }
  res.json(data);
});

// All models with pricing (flat list).
app.get("/v1/pricing/models", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  const models = [
    ...data.hanzoModels.map((m) => ({ ...m, provider: "Hanzo", category: "zen" })),
    ...data.thirdPartyModels.map((m) => ({ ...m, category: m.featured ? "featured" : "third-party" })),
  ];
  res.json({ updated: data.updated, total: models.length, models });
});

// Single model lookup by name or id (case-insensitive).
app.get("/v1/pricing/model/:name", (req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  const q = req.params.name.toLowerCase();
  const model =
    data.hanzoModels.find((m) => m.name.toLowerCase() === q) ||
    data.thirdPartyModels.find(
      (m) => m.name.toLowerCase() === q || (m.id && m.id.toLowerCase() === q)
    );
  if (!model) {
    return res.status(404).json({ error: `Model not found: ${req.params.name}` });
  }
  res.json(model);
});

// Summary endpoint.
app.get("/v1/pricing/summary", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  res.json({
    updated: data.updated,
    ...data.summary,
    providers: data.providers,
  });
});

// Free models only.
app.get("/v1/pricing/free", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  const free = data.thirdPartyModels.filter((m) => m.isFree);
  res.json({ updated: data.updated, total: free.length, models: free });
});

// Featured third-party models only.
app.get("/v1/pricing/featured", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  const featured = data.thirdPartyModels.filter((m) => m.featured);
  res.json({ updated: data.updated, total: featured.length, models: featured });
});

// Compute pricing (for playground backend).
app.get("/v1/pricing/compute", (_req, res) => {
  const data = loadPricing();
  if (!data?.infrastructure?.compute) {
    return res.status(503).json({ error: "Compute pricing not yet available" });
  }
  res.json(data.infrastructure.compute);
});

// Compute presets (for LaunchPage).
app.get("/v1/pricing/compute/presets", (_req, res) => {
  const data = loadPricing();
  if (!data?.infrastructure?.compute?.presets) {
    return res.status(503).json({ error: "Compute presets not yet available" });
  }
  res.json({ presets: data.infrastructure.compute.presets });
});

// Hanzo Cloud plans.
app.get("/v1/pricing/cloud", (_req, res) => {
  const data = loadPricing();
  if (!data?.cloud) {
    return res.status(503).json({ error: "Cloud pricing not yet available" });
  }
  // Strip internal routing/cost data from public response.
  const { _internal, ...publicCloud } = data.cloud;
  res.json(publicCloud);
});

// Cloud plans only (for pricing page).
app.get("/v1/pricing/cloud/plans", (_req, res) => {
  const data = loadPricing();
  if (!data?.cloud?.plans) {
    return res.status(503).json({ error: "Cloud plans not yet available" });
  }
  res.json({ plans: data.cloud.plans });
});

// Cloud regions.
app.get("/v1/pricing/cloud/regions", (_req, res) => {
  const data = loadPricing();
  if (!data?.cloud?.regions) {
    return res.status(503).json({ error: "Cloud regions not yet available" });
  }
  res.json({ regions: data.cloud.regions });
});

// Block storage pricing.
app.get("/v1/pricing/cloud/storage", (_req, res) => {
  const data = loadPricing();
  if (!data?.cloud?.blockStorage) {
    return res.status(503).json({ error: "Storage pricing not yet available" });
  }
  res.json(data.cloud.blockStorage);
});

// Provider breakdown.
app.get("/v1/pricing/providers", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  res.json({ updated: data.updated, providers: data.providers });
});

// Subscription plans (from @hanzo/plans).
app.get("/v1/pricing/subscriptions", (_req, res) => {
  res.json({ plans: subscriptionPlans });
});

// Blockchain / RPC plans (from @hanzo/plans).
app.get("/v1/pricing/blockchain", (_req, res) => {
  res.json({ plans: blockchainPlans });
});

// IAM / identity plans (from @hanzo/plans).
app.get("/v1/pricing/iam", (_req, res) => {
  res.json({ plans: iamPlans });
});

// SuperBase / Hanzo Base hosting plans (from @hanzo/plans).
// One plan per tenant tier; usage.perTenantMonth is the Commerce SKU rate.
app.get("/v1/pricing/base", (_req, res) => {
  res.json({ plans: basePlans });
});

// PaaS / hanzo platform plans (from @hanzo/plans).
app.get("/v1/pricing/paas", (_req, res) => {
  res.json({ plans: paasPlans });
});

// Transparent pricing policy + revenue sharing (from @hanzo/plans).
app.get("/v1/pricing/policy", (_req, res) => {
  res.json(pricingPolicy);
});

// ---------------------------------------------------------------------------
// Convenience aliases — cleaner top-level access
// ---------------------------------------------------------------------------

// /v1/models — Unified model listing. The ONE endpoint all frontends call.
// Includes Zen models, third-party, families, and summary.
// CF caches at edge. Frontends never need build-time model data.
app.get("/v1/models", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Model data not yet available" });
  }
  const zenModels = data.hanzoModels.map((m) => ({
    id: m.id || m.name,
    object: "model",
    owned_by: "hanzo",
    ...m,
    provider: "Hanzo",
  }));
  const thirdParty = data.thirdPartyModels.map((m) => ({
    id: m.id || m.name,
    object: "model",
    owned_by: m.provider || "third-party",
    ...m,
  }));
  res.json({
    object: "list",
    updated: data.updated,
    summary: data.summary,
    families: data.families || [],
    data: [...zenModels, ...thirdParty],
  });
});

// /v1/plans — subscription plans.
app.get("/v1/plans", (_req, res) => {
  res.json({ plans: subscriptionPlans });
});

// /v1/cloud — cloud VM plans + regions + storage.
app.get("/v1/cloud", (_req, res) => {
  const data = loadPricing();
  if (!data?.cloud) {
    return res.status(503).json({ error: "Cloud pricing not yet available" });
  }
  const { _internal, ...publicCloud } = data.cloud;
  res.json(publicCloud);
});

// /v1/subscriptions — subscription plans (alias).
app.get("/v1/subscriptions", (_req, res) => {
  res.json({ plans: subscriptionPlans });
});

// /v1/tools — tool pricing (from @hanzo/plans, fallback to synced data).
app.get("/v1/tools", (_req, res) => {
  res.json({ tools: canonicalTools });
});

// /v1/gpu — GPU tier pricing (from @hanzo/plans, fallback to synced data).
app.get("/v1/gpu", (_req, res) => {
  res.json({ tiers: canonicalGpuTiers });
});

// /v1/pricing-policy — transparent pricing policy.
app.get("/v1/pricing-policy", (_req, res) => {
  res.json(pricingPolicy);
});

// /v1/iam — IAM / identity plans.
app.get("/v1/iam", (_req, res) => {
  res.json({ plans: iamPlans });
});

// Manual sync trigger (always requires API key).
app.post("/v1/sync", async (req, res) => {
  const auth = req.headers.authorization;
  if (!API_KEY || !auth || auth !== `Bearer ${API_KEY}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const data = await sync();
    invalidateCache();
    res.json({ status: "ok", updated: data.updated, summary: data.summary });
  } catch (err) {
    console.error("[server] Sync failed:", err.message);
    res.status(500).json({ error: "Sync failed", message: err.message });
  }
});

// Start server.
let syncInterval = null;

const server = app.listen(PORT, () => {
  console.log(`[server] Hanzo Pricing API listening on port ${PORT}`);

  // Serve immediately from disk cache if available.
  const cached = loadPricing();
  if (cached) {
    console.log("[server] Loaded existing pricing data from disk.");
  }

  // Run initial sync in background — don't block startup.
  sync()
    .then(() => {
      invalidateCache();
      console.log("[server] Initial sync complete.");
    })
    .catch((err) => {
      console.error("[server] Initial sync failed:", err.message);
      console.error("[server] Will retry in 6 hours.");
    });

  // Schedule periodic sync every 6 hours.
  syncInterval = setInterval(async () => {
    try {
      await sync();
      invalidateCache();
      console.log("[server] Periodic sync complete.");
    } catch (err) {
      console.error("[server] Periodic sync failed:", err.message);
    }
  }, SYNC_INTERVAL_MS);
});

// Graceful shutdown.
function shutdown(signal) {
  console.log(`[server] ${signal} received, shutting down...`);
  if (syncInterval) clearInterval(syncInterval);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
