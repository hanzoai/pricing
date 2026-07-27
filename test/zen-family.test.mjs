import { test } from "node:test";
import assert from "node:assert/strict";

import { buildZenModels } from "../src/sync.mjs";
import { ensoCatalog } from "../src/models.mjs";

// A faithful slice of what zen's GET /v1/models actually returns (captured live):
// exact-decimal price strings, context_window, mode, and the vision capability.
const ZEN_MODELS = [
  { id: "zen5", context_window: 1000000, mode: "", pricing: { input: "4.176", output: "13.2", cache_read: "1.044" }, capabilities: { vision: false } },
  { id: "zen5-flash", context_window: 65536, mode: "", pricing: { input: "0.336", output: "0.672", cache_read: "0.084" } },
  { id: "zen-vl", context_window: 128000, mode: "", pricing: { input: "0.60", output: "1.80" }, capabilities: { vision: true } },
  { id: "zen-image", context_window: 0, mode: "image", pricing: { input: "0.24", output: "0.24" } },
  { id: "zen-embedding", context_window: 8192, mode: "embedding", pricing: { input: "0.06", output: "0.06" } },
];

// Branded copy for SOME ids; one entry names a SKU zen does not serve.
const META = [
  { name: "zen5", fullName: "Zen5 — Flagship", description: "The default.", features: ["1M context"], tier: "pro" },
  { name: "zen5-phantom", fullName: "Zen5 Phantom", description: "does not exist", tier: "ghost" },
];

test("the family is zen's live list, priced at zen's numbers", () => {
  const fam = buildZenModels(ZEN_MODELS, META);
  // Exactly the SKUs zen serves — the phantom meta entry adds nothing.
  assert.equal(fam.length, ZEN_MODELS.length);
  assert.deepEqual(fam.map((m) => m.name).sort(), ZEN_MODELS.map((m) => m.id).sort());

  const zen5 = fam.find((m) => m.name === "zen5");
  // The real price, not null — this is the bug the refactor closes.
  assert.deepEqual(zen5.pricing, { input: 4.176, output: 13.2, cacheRead: 1.044, cacheWrite: null });
  assert.equal(zen5.context, 1000000);
  // Branded copy grafts on where the catalog has it.
  assert.equal(zen5.fullName, "Zen5 — Flagship");
});

test("a SKU with no branded copy still shows, with a derived name and real price", () => {
  const fam = buildZenModels(ZEN_MODELS, META);
  const flash = fam.find((m) => m.name === "zen5-flash");
  assert.equal(flash.fullName, "Zen5 Flash"); // derived by title-casing the id
  assert.equal(flash.pricing.input, 0.336);
});

test("vision capability rides through from zen", () => {
  const fam = buildZenModels(ZEN_MODELS, META);
  assert.equal(fam.find((m) => m.name === "zen-vl").vision, true);
  assert.equal(fam.find((m) => m.name === "zen5").vision, undefined);
});

test("media SKUs are priced per unit, not per MTok", () => {
  const fam = buildZenModels(ZEN_MODELS, META);
  const img = fam.find((m) => m.name === "zen-image");
  assert.equal(img.pricingUnit, "image");
  assert.deepEqual(img.pricing, { perUnit: 0.24 });
});

test("a SKU zen does not serve is never invented from catalog copy", () => {
  const fam = buildZenModels(ZEN_MODELS, META);
  assert.equal(fam.find((m) => m.name === "zen5-phantom"), undefined);
});

test("the Zen family is branded owned_by zenlm (open Zen LM, not hanzo)", () => {
  const fam = buildZenModels(ZEN_MODELS, META);
  assert.ok(fam.length > 0);
  for (const m of fam) assert.equal(m.owned_by, "zenlm", `${m.name} should be owned_by zenlm`);
});

test("Enso is a three-SKU family, generally available (owned_by hanzo, no waitlist)", () => {
  assert.deepEqual(ensoCatalog.map((m) => m.name), ["enso", "enso-flash", "enso-ultra"]);
  for (const m of ensoCatalog) {
    assert.equal(m.owned_by, "hanzo", `${m.name} should be owned_by hanzo`);
    assert.ok(!m.gated && !m.access, `${m.name} must not be gated/waitlisted`);
    assert.ok(m.pricing.input > 0 && m.pricing.output > 0, `${m.name} must carry retail pricing`);
  }
});
