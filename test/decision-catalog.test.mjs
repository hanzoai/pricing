import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decisionCatalog } from "../src/models.mjs";
import { hanzoModelView } from "../src/sync.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "pricing.json");

// Kai is served at POST /v1/decisions and billed on its input tokens. The ai
// gateway polls /v1/pricing/models for per-token rates, and this row is the one
// it bills kai at: $0.021 per million input tokens, output free.
test("kai is priced per input token at /v1/decisions", () => {
  const kai = decisionCatalog.find((m) => m.name === "kai");
  assert.ok(kai, "kai is in the decision roster");
  assert.equal(kai.endpoint, "/v1/decisions");
  assert.equal(kai.owned_by, "hanzo");
  assert.equal(kai.pricingUnit, "token");
  assert.equal(kai.pricing.input, 0.021);
  assert.equal(kai.pricing.output, 0);

  const view = hanzoModelView(kai);
  assert.equal(view.provider, "Hanzo");
  assert.equal(view.category, "specialty");
});

// hanzo/kai is Kai's canonical id, and the gateway bills it, and its alias
// hanzoai/kai, at this row: Kai's price, at /v1/decisions.
test("hanzo/kai is kai's price under the canonical id", () => {
  const kai = decisionCatalog.find((m) => m.name === "kai");
  const canonical = decisionCatalog.find((m) => m.name === "hanzo/kai");
  assert.ok(canonical, "hanzo/kai is in the decision roster");
  assert.deepEqual({ ...canonical, name: "kai" }, kai);
  assert.ok(!decisionCatalog.some((m) => m.name === "hanzoai/kai"), "an alias has no row of its own");
});

// Jev is listed under OpenRouter's vendor ids, which the gateway forwards to Jev
// itself, at Jev's list price: $0.042 per million input tokens, output free, twice
// Kai's. It is TypeSafe's, never Hanzo's.
test("jev is priced per input token at its list price", () => {
  const kai = decisionCatalog.find((m) => m.name === "kai");
  for (const name of ["typesafe/jev-1.13", "~typesafe/jev-latest"]) {
    const jev = decisionCatalog.find((m) => m.name === name);
    assert.ok(jev, `${name} is in the decision roster`);
    assert.equal(jev.pricingUnit, "token");
    assert.equal(jev.pricing.input, 0.042);
    assert.equal(jev.pricing.output, 0);
    assert.equal(jev.pricing.input, 2 * kai.pricing.input);
    assert.equal(jev.owned_by, "typesafe");
    assert.equal(hanzoModelView(jev).provider, "TypeSafe");
  }
  assert.ok(!decisionCatalog.some((m) => /^jev/.test(m.name)), "a bare Jev id has no row");
});

test("only public decision ids are listed", () => {
  for (const m of decisionCatalog) {
    assert.doesNotMatch(m.name, /^laya/, `${m.name} is a benchmark baseline, not a product`);
  }
});

test("the served snapshot carries the roster as sync writes it", () => {
  const data = JSON.parse(readFileSync(DATA, "utf-8"));
  for (const m of decisionCatalog) {
    const row = data.hanzoModels.find((h) => h.name === m.name);
    assert.deepEqual(row, m, `${m.name} in data/pricing.json matches decisionCatalog`);
  }
  assert.equal(data.summary.decisionModels, decisionCatalog.length);
  assert.ok(!data.hanzoModels.some((h) => /^laya/.test(h.name)));
});
