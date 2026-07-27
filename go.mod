// hanzoai/pricing — Go embed module.
//
// This repo's PRIMARY artifact is the Node @hanzo/pricing service
// (src/server.mjs Express app + src/sync.mjs live sync + data/pricing.json).
// This tiny Go module exists ONLY so the unified hanzoai/cloud binary
// (HIP-0106) can embed the SAME pricing catalog + the goja bundle
// (goja/bundle.js) and serve /v1/pricing/* in-process via dop251/goja —
// without copying any pricing source into the cloud repo.
//
// Express does NOT run in goja (it needs Node's http stack), so goja/bundle.js
// is the ESM-free port of the server.mjs HANDLERS + the sync.mjs MARKUP logic.
// The live network fetch is the only piece that stays outside goja; the cloud
// host performs the HTTP GETs and feeds raw JSON to the bundle's applyMarkup().
//
// std-lib only — no third-party Go deps.
module github.com/hanzoai/pricing

go 1.26.5
