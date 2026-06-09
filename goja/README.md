# `goja/` — @hanzo/pricing inside the unified cloud binary

`bundle.js` is the **engine-runnable** companion to `src/server.mjs` (the
Express app) + `src/sync.mjs` (the live sync), authored to run inside the
[`dop251/goja`](https://github.com/dop251/goja) JavaScript engine embedded in
[`hanzoai/cloud`](https://github.com/hanzoai/cloud) per HIP-0106.

## Why not run `server.mjs` verbatim?

`server.mjs` is an **Express** app. Express needs Node's `http`/`net` stack,
which goja does not provide — **Express cannot run in goja**. So the Express
*transport* is dropped (the cloud binary's `zip` router owns the listener +
routes) and the pricing **handlers** (pure transforms over `data/pricing.json`
+ the `@hanzo/plans` catalog) are ported here to run in goja.

The **markup logic** from `sync.mjs` (`toMTok`, `roundPrice`,
`processOpenRouterModel`, `processHuggingFaceModel`, …) is **also** ported here
and runs in goja via `globalThis.applyMarkup()`. The only piece that does *not*
run in goja is the live network fetch (OpenRouter/HF/DO — no `fetch`/
`AbortController` in goja): the Go host performs the HTTP GETs and feeds the raw
JSON into `applyMarkup`.

## Host contract

```
globalThis.__PRICING_DATA__ = <data/pricing.json>
globalThis.__PLANS_EXTRA__  = { iam, base, paas }
globalThis.__PLANS_DATA__   = { "subscription.json": <obj>, … }   // @hanzo/plans
globalThis.__MARKUP__       = { thirdParty: <float>, computeMonthly: <float> }
globalThis.handle({ route, params, query, tenant }) -> { status, body }
globalThis.applyMarkup({ openrouter:[…], huggingface:[…] }) -> shaped sections
```

The Go wrapper (`hanzoai/cloud/clients/pricingsvc`) injects the data, registers
the `/v1/pricing/*` (+ `/v1/models`) zip routes, calls `handle()` per request,
and drives `applyMarkup()` from the admin-gated `POST /v1/pricing/sync`.

## Tests

`test/bundle.test.mjs` (run via `npm test`) asserts the read handlers shape data
correctly + strip `cloud._internal`, and that the markup math is exact
(`toMTok(0.0000025) -> 2.5 $/MTok`).
