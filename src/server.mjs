// Hanzo pricing API server.
//
// Endpoints:
//   GET  /health              — health check
//   GET  /v1/pricing          — full pricing data
//   GET  /v1/pricing/models   — all models (hanzo + third-party) with pricing
//   GET  /v1/pricing/model/:name — single model lookup (case-insensitive)
//   POST /v1/sync             — trigger manual sync (requires PRICING_API_KEY)

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

// Health check.
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Full pricing data.
app.get("/v1/pricing", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  res.json(data);
});

// All models with pricing.
app.get("/v1/pricing/models", (_req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  const models = [
    ...data.hanzoModels.map((m) => ({ ...m, provider: "hanzo" })),
    ...data.thirdPartyModels.map((m) => ({ ...m, provider: "third-party" })),
  ];
  res.json({ updated: data.updated, models });
});

// Single model lookup by name (case-insensitive).
app.get("/v1/pricing/model/:name", (req, res) => {
  const data = loadPricing();
  if (!data) {
    return res.status(503).json({ error: "Pricing data not yet available" });
  }
  const name = req.params.name.toLowerCase();
  const model =
    data.hanzoModels.find((m) => m.name.toLowerCase() === name) ||
    data.thirdPartyModels.find((m) => m.name.toLowerCase() === name);
  if (!model) {
    return res.status(404).json({ error: `Model not found: ${req.params.name}` });
  }
  res.json(model);
});

// Manual sync trigger (protected by API key).
app.post("/v1/sync", async (req, res) => {
  if (API_KEY) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${API_KEY}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  try {
    const data = await sync();
    res.json({ status: "ok", updated: data.updated });
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
