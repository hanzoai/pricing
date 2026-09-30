import { test } from "node:test";
import assert from "node:assert/strict";

import { ensoCatalog } from "../src/models.mjs";
import { buildEnsoModels } from "../src/sync.mjs";

// Enso retail rates are a BILLING input, not a label.
//
// The ai gateway runs `features.live_mode: true` with
// `pricing_url: https://pricing.hanzo.ai`, so it polls /v1/pricing/models into its
// billing price map (mc.pricing). calculateCostCentsWithCache charges from that map
// whenever family discovery has not populated for the requested SKU — which is every
// cold start, and cloud deploys with a single replica and strategy Recreate. So a
// wrong number in ensoCatalog is a wrong CHARGE.
//
// This test holds the copies equal: the literals here must match the owners below.
//
// Owners of the truth, which must agree with the literals here:
//   - hanzoai/zen/catalog-enso.yaml            → `retail: { in, out }`
//   - hanzoai/commerce/.../seed/enso-models.json → `rates[].price`  (commerce owns pricing)
//
// `context` is held to the same comparison. It is the offline fallback for the
// window the serving gateway advertises (catalog-enso.yaml `route[].ctx`, replicated
// in commerce's `spec.contextWindow`), so a stale copy publishes a window we do not
// serve on every cycle enso is unreachable.
const RETAIL = {
  enso: { input: 4, output: 20, context: 1000000 },
  "enso-flash": { input: 2, output: 4, context: 262144 },
  "enso-ultra": { input: 5, output: 25, context: 1000000 },
};

test("enso retail rates match what the gateway actually bills", () => {
  for (const [name, want] of Object.entries(RETAIL)) {
    const entry = ensoCatalog.find((m) => m.name === name);
    assert.ok(entry, `ensoCatalog is missing ${name}`);
    assert.equal(entry.pricing.input, want.input, `${name} input per MTok`);
    assert.equal(entry.pricing.output, want.output, `${name} output per MTok`);
  }
});

test("enso context windows match what the gateway actually serves", () => {
  for (const [name, want] of Object.entries(RETAIL)) {
    const entry = ensoCatalog.find((m) => m.name === name);
    assert.equal(entry.context, want.context, `${name} context window`);
  }
});

// The window is stated ONCE per card, by the builder, from the window that won.
// Hand-typing it into `features` is what put "200K context window" on the live
// enso-ultra card while the same card's `context` read 1000000, and "1M context
// window" on an enso-flash serving 262144: the served window won the field and the
// copy kept its own answer. A catalog that states the number cannot be corrected by
// the service, so it must not state it.
test("catalog copy never states the context window", () => {
  for (const m of ensoCatalog) {
    for (const f of m.features || []) {
      assert.doesNotMatch(
        f,
        /context window/i,
        `${m.name}: the window bullet is derived from the served window, not typed here`,
      );
    }
  }
});

test("the window bullet is the window that won, live or fallback", () => {
  // Live wins: enso answers with a window our copy does not have.
  const [live] = buildEnsoModels(
    [{ id: "enso-flash", context_window: 1000000 }],
    ensoCatalog,
  );
  assert.equal(live.context, 1000000);
  assert.equal(live.features[0], "1M context window");

  // Unreachable: the catalog replays through the SAME builder, so the bullet still
  // agrees with the card rather than being a spread of stale copy.
  const fallback = buildEnsoModels(
    ensoCatalog.map((m) => ({ id: m.name, context_window: m.context })),
    ensoCatalog,
  );
  assert.deepEqual(
    fallback.map((m) => [m.name, m.context, m.features[0]]),
    [
      ["enso", 1000000, "1M context window"],
      ["enso-flash", 262144, "262k context window"],
      ["enso-ultra", 1000000, "1M context window"],
    ],
  );
  for (const m of fallback) {
    assert.equal(m.family, "enso");
    assert.equal(m.owned_by, "hanzo");
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
