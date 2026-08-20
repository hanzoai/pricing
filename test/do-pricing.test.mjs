import { test } from "node:test";
import assert from "node:assert/strict";

import { doFallbackPrices } from "../src/models.mjs";

// A provider failure must not look like a success. These run fetchDOPricing
// against a stubbed DigitalOcean and assert the result SAYS which it was: the
// prices come back either way, so the provenance is the only thing that can
// tell a measured price from one frozen in the models.mjs table.
//
// The token is read once, when sync.mjs loads, so the two token states are two
// module instances — the query string gives the second one its own entry in the
// ESM cache. Importing sync.mjs runs no sync (the standalone guard checks
// argv), so this costs nothing but the parse.
process.env.DO_API_TOKEN = "do_v1_a_revoked_token_is_still_a_string";
const { fetchDOPricing, syncStatus } = await import("../src/sync.mjs");

delete process.env.DO_API_TOKEN;
const { fetchDOPricing: fetchWithNoToken } = await import("../src/sync.mjs?no-token");

// Stand in for the DO API for one call, then put the real fetch back.
async function withFetch(answer, run) {
  const real = globalThis.fetch;
  globalThis.fetch = async () => answer();
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

// One size, priced a dollar above the frozen table, so a live read is
// distinguishable by its numbers and not only by its label.
const LIVE_BODY = {
  sizes: [
    { slug: "s-1vcpu-1gb", vcpus: 1, memory: 1024, disk: 25, price_monthly: 7, price_hourly: 0.01042 },
  ],
};
const ok = () => ({ ok: true, status: 200, json: async () => LIVE_BODY });
const unauthorized = () => ({ ok: false, status: 401, json: async () => ({ id: "unauthorized" }) });

test("a token the provider refuses is reported frozen, and says what refused it", async () => {
  const res = await withFetch(unauthorized, fetchDOPricing);

  assert.notEqual(res.source, "live", "a 401 must never be reported as measured");
  assert.equal(res.source, "frozen");
  assert.match(res.reason, /401/, "the reason names what stopped us");

  // Still serves a catalog — a blank price list is worse for a customer than a
  // stale one — and serves it from the table, at the table's numbers.
  assert.deepEqual(res.prices, doFallbackPrices);
  assert.equal(res.prices["s-1vcpu-1gb"].priceMonthly, 6);
});

test("a provider that answers is reported live, at the numbers it answered with", async () => {
  const res = await withFetch(ok, fetchDOPricing);

  assert.equal(res.source, "live");
  assert.equal(res.reason, null, "nothing stopped us, so there is nothing to name");
  assert.equal(res.prices["s-1vcpu-1gb"].priceMonthly, 7, "the measured price, not the table's 6");
});

test("no token is its own state: there was nothing to ask", async () => {
  let asked = false;
  const res = await withFetch(
    () => {
      asked = true;
      throw new Error("fetchDOPricing asked DO without a token");
    },
    fetchWithNoToken
  );

  assert.equal(asked, false, "with no credential there is no request to make");
  assert.equal(res.source, "unasked");
  assert.notEqual(res.source, "frozen", "a credential nobody set is not a provider that refused us");
  assert.notEqual(res.source, "live");
  assert.match(res.reason, /DO_API_TOKEN/);
  assert.deepEqual(res.prices, doFallbackPrices);
});

test("the three outcomes are three answers, not one", async () => {
  const live = await withFetch(ok, fetchDOPricing);
  const refused = await withFetch(unauthorized, fetchDOPricing);
  const nothingToAsk = await withFetch(() => {
    throw new Error("must not ask");
  }, fetchWithNoToken);

  const answers = [live.source, refused.source, nothingToAsk.source];
  assert.equal(new Set(answers).size, 3, `collapsed to one answer: ${answers.join(", ")}`);
});

// The word every announcement of a run goes by — both server sync logs, the
// standalone script and POST /v1/sync read this one answer. Which sections land
// in `summary.degraded` is decided inside sync(), which writes the catalog to
// disk and so is not called here.
test("a run holding a frozen section may not be announced as ok", () => {
  assert.equal(syncStatus({ summary: { degraded: ["compute"] } }), "degraded");
  assert.equal(syncStatus({ summary: { degraded: [] } }), "ok");
});
