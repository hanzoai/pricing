import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { publicView } from "../src/view.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "pricing.json");

// The public catalog names SKUs and prices only: never a supplier, a cost
// basis or a markup. Checked against the committed snapshot and the served view.
const FORBIDDEN = /"(basePriceMonthly|basePriceHourly|markupMonthly|markupHourly|providerCosts|planRouting)"|"digitalocean"/;

test("the snapshot and the served view carry no supplier, cost or margin", () => {
  const text = readFileSync(DATA, "utf-8");
  for (const [name, body] of [["snapshot", text], ["served view", JSON.stringify(publicView(JSON.parse(text)))]]) {
    const found = body.match(new RegExp(FORBIDDEN.source, "g")) || [];
    assert.deepEqual(found, [], `${name} carries: ${[...new Set(found)].join(", ")}`);
  }
});

test("stripping internals leaves the customer's price intact", () => {
  const view = publicView(JSON.parse(readFileSync(DATA, "utf-8")));
  const tiers = view.infrastructure?.compute?.tiers ?? [];
  assert.ok(tiers.length > 0, "compute tiers must survive the strip");
  for (const t of tiers) {
    assert.ok(t.slug, "a tier keeps its slug");
    assert.equal(typeof t.priceMonthly, "number", "a tier keeps the price we charge");
    assert.equal(t._internal, undefined, "a tier keeps nothing we pay");
  }
});

test("publicView strips _internal at any depth", () => {
  const v = publicView({
    keep: 1,
    _internal: { cost: 9 },
    nested: { keep: 2, _internal: { cost: 9 }, list: [{ keep: 3, _internal: { cost: 9 } }] },
  });
  assert.deepEqual(v, { keep: 1, nested: { keep: 2, list: [{ keep: 3 }] } });
});
