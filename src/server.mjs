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
//   GET  /v1/pricing/providers          — provider breakdown with counts
//   POST /v1/sync                       — trigger manual sync (requires PRICING_API_KEY)

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { sync } from "./sync.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "..", "data", "pricing.json");

const PORT = parseInt(process.env.PORT || "8080", 10);
const API_KEY = process.env.PRICING_API_KEY || "";

// Sync interval: 6 hours.
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Load pricing data from disk.
 */
function loadPricing() {
  if (!existsSync(DATA_FILE)) {
    return null;
  }
  return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
}

const app = express();
app.use(express.json());

// CORS for frontend.
app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  next();
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

// Full pricing data.
app.get("/v1/pricing", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
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

// Provider breakdown.
app.get("/v1/pricing/providers", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  res.json({ updated: data.updated, providers: data.providers });
});

// Manual sync trigger (always requires API key).
app.post("/v1/sync", async (req, res) => {
  const auth = req.headers.authorization;
  if (!API_KEY || !auth || auth !== `Bearer ${API_KEY}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const data = await sync();
    res.json({ status: "ok", updated: data.updated, summary: data.summary });
  } catch (err) {
    console.error("[server] Sync failed:", err.message);
    res.status(500).json({ error: "Sync failed", message: err.message });
  }
});

// Start server.
const server = app.listen(PORT, async () => {
  console.log(`[server] Hanzo Pricing API listening on port ${PORT}`);

  // Run initial sync on startup.
  try {
    await sync();
    console.log("[server] Initial sync complete.");
  } catch (err) {
    console.error("[server] Initial sync failed:", err.message);
    console.error("[server] Will retry in 6 hours.");
  }

  // Schedule periodic sync every 6 hours.
  setInterval(async () => {
    try {
      await sync();
      console.log("[server] Periodic sync complete.");
    } catch (err) {
      console.error("[server] Periodic sync failed:", err.message);
    }
  }, SYNC_INTERVAL_MS);
});

// Graceful shutdown.
process.on("SIGTERM", () => {
  console.log("[server] SIGTERM received, shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("[server] SIGINT received, shutting down...");
  server.close(() => process.exit(0));
});
