import { test } from "node:test";
import assert from "node:assert/strict";

import { ensoCatalog } from "../src/models.mjs";

// Enso retail rates are a BILLING input, not a label.
//
// The ai gateway runs `features.live_mode: true` with
// `pricing_url: https://pricing.hanzo.ai`, so it polls /v1/pricing/models into its
// billing price map (mc.pricing). calculateCostCentsWithCache charges from that map
// whenever family discovery has not populated for the requested SKU — which is every
// cold start, and cloud deploys with a single replica and strategy Recreate. So a
// wrong number in ensoCatalog is a wrong CHARGE.
//
// This catalog went on publishing the pre-2026-07-22 rates (20/60, 2/6, 40/120) for
// months after the reprice landed in the two owners below — a 5x-8x overcharge on the
// path above, and a wrong quote everywhere the pricing feed is rendered. Nothing was
// comparing the copies, so nothing failed. This test is that comparison.
//
// Owners of the truth, which must agree with the literals here:
//   - hanzoai/zen/catalog-enso.yaml            → `retail: { in, out }`
//   - hanzoai/commerce/.../seed/enso-models.json → `rates[].price`  (commerce owns pricing)
const RETAIL = {
  enso: { input: 4, output: 20 },
  "enso-flash": { input: 2, output: 4 },
  "enso-ultra": { input: 5, output: 25 },
};

test("enso retail rates match what the gateway actually bills", () => {
  for (const [name, want] of Object.entries(RETAIL)) {
    const entry = ensoCatalog.find((m) => m.name === name);
    assert.ok(entry, `ensoCatalog is missing ${name}`);
    assert.equal(entry.pricing.input, want.input, `${name} input per MTok`);
    assert.equal(entry.pricing.output, want.output, `${name} output per MTok`);
  }
});

test("ensoCatalog lists every public SKU and nothing else", () => {
  assert.deepEqual(
    ensoCatalog.map((m) => m.name).sort(),
    Object.keys(RETAIL).sort(),
  );
});

// enso-vl and enso-vl-pro are internal SKUs. They are billed, but never listed:
// publishing them here would put them in the public feed and the catalog UI.
test("internal enso SKUs are never published", () => {
  for (const internal of ["enso-vl", "enso-vl-pro"]) {
    assert.equal(
      ensoCatalog.some((m) => m.name === internal),
      false,
      `${internal} is internal and must not appear in the public catalog`,
    );
  }
});
