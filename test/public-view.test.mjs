import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { publicView } from "../src/view.mjs";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "pricing.json");

// What a customer must never learn from us: which supplier serves a SKU, what
// that supplier charges us, and the margin we add. This ran against the real
// catalog and found the live leak — `infrastructure` published `digitalocean`,
// `basePriceMonthly` and `markupMonthly` to anyone who asked, because the strip
// lived at three call sites that each only knew about `cloud`.
const FORBIDDEN = /"(basePriceMonthly|basePriceHourly|markupMonthly|markupHourly|providerCosts|planRouting)"|"digitalocean"/;

test("the served view carries no supplier, cost or margin", () => {
  const raw = JSON.parse(readFileSync(DATA, "utf-8"));

  // The catalog itself HOLDS these — that is the point of the file, and it is
  // what makes this test non-vacuous: if the assertion below ever passes because
  // the data went empty rather than because the view strips, this fails first.
  assert.match(JSON.stringify(raw), FORBIDDEN, "fixture no longer contains internals — the test would prove nothing");

  const served = JSON.stringify(publicView(raw));
  const leaked = served.match(new RegExp(FORBIDDEN.source, "g")) || [];
  assert.deepEqual(leaked, [], `served view leaks: ${[...new Set(leaked)].join(", ")}`);
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
