# pricing — hanzoai/pricing

`pricing.hanzo.ai` — the public model + pricing catalog aggregator. It is the
**canonical origin** the `hanzoai/catalog` Cloudflare Worker edge-caches; that
worker serves `api.hanzo.ai/v1/{models,pricing}` (anonymous/public view). So the
model picker in hanzo.chat / hanzo.app ultimately reads THIS service's
`/v1/models`.

Runtime: standalone Node/Express (`src/server.mjs` → imports `src/sync.mjs`).
`goja/bundle.js` is a SEPARATE artifact used only by the cloud unified binary's
`/v1/pricing/*` subsystem (which does not serve `/v1/models`).

## Model catalog — three dynamic sources, one merge (`src/sync.mjs`)

| Source | Origin | Namespace in `/v1/models` |
|--------|--------|---------------------------|
| Zen first-party | `zenCatalog` (metadata) in `src/models.mjs` + live pricing from `ZEN_GATEWAY_URL` | `zen*`, `owned_by:hanzo` |
| **do-ai first-party** | `DO_AI_URL` (`inference.do-ai.run`) `/v1/models`, key `DO_AI_API_KEY` | utility ids (`bge-m3`, `stable-diffusion-3.5-large`, `router:*`, …), `owned_by:hanzo` |
| Third-party mirror | OpenRouter (+ HuggingFace if `HF_TOKEN`), dynamic | `vendor/model` |

do-ai surfaces only **utility** kinds (embeddings, rerank, image, router, speech,
video — see `DO_AI_KINDS`). do-ai **chat** models are excluded: Zen wraps them and
OpenRouter already mirrors them, so exposing them raw would duplicate the list and
break the "Zen models are our own" brand policy. This is the same upstream + key
the in-cluster `model-sync` CronJob reads — one source of truth for do-ai.

## Add a model — ONE way

- **do-ai model** (embeddings / image / routers / etc.): nothing to do here. Add it
  on do-ai (or it appears in `inference.do-ai.run/v1/models`) → next sync surfaces
  it automatically. Widen exposure to a new KIND by adding one row to `DO_AI_KINDS`.
- **Zen first-party**: add to `zenCatalog` in `src/models.mjs` (branded metadata).
- **Third-party**: nothing — detected dynamically from OpenRouter.

No hand-maintained per-model list. Curate visibility via the catalog enablement
overlay (admin), not by editing catalogs in multiple places.

## Deploy

`.github/workflows/deploy.yml` (native arcd runners) builds `ghcr.io/hanzoai/pricing`
and rolls the `pricing` Deployment (ns `hanzo`). `server.mjs` syncs on boot + every
6h; the `pricing-sync` CronJob POSTs `/v1/sync` daily. The catalog worker's own cron
(`0 6 * * *`) then re-primes its KV/edge from this origin.

## UNRESOLVED — two owners of the Enso retail price, and a test that keeps them apart

**Needs a human decision. Do not "reconcile" this by editing one side.**

One number has two owners, and they disagree:

| Owner | Lives in | Enso | Flash | Ultra |
|---|---|---|---|---|
| **published retail** — this repo | `src/models.mjs` (~522/532/542) | 20 / 60 | 2 / 6 | 40 / 120 |
| **billed retail** — the enso service | Enso catalog `retail:`, deployed via `universe/charts/app/values/enso/enso.yaml` | 4 / 20 | 2 / 4 | 5 / 25 |

The billed side is settled: it is what `hanzo.cloud_usage` rows reconcile to
(1,296 rows), what the deployed catalog carries, and what `hanzoai/cloud`'s
`model.go:25-27` reasons about. It has served since the 2026-07-22/23 reprice.

The divergence is **deliberate and enforced**, not drift:

- `src/sync.mjs:1091` — `pricing: m.pricing || {…live…}`. Our local copy WINS;
  the price the service actually serves is only a fallback. Note the asymmetry
  one line above: `context: em.context_window || m.context` — for the context
  window the LIVE value wins.
- `test/vendor-naming.test.mjs:141` — the test is literally named *"enso owns the
  window; we own the price"* and asserts both halves: `m.context === 262144`
  (live wins) and `m.pricing === { input: 2, output: 6 }` (our copy wins, even
  when the live input is the correct 2/4).

So "just publish 4/20" would fight a passing test that encodes an intentional
policy. The policy — *retail is set by us, not derived from whatever an upstream
happens to charge* — is sound. The problem is that this repo holds a **third**
copy of a number the catalog's `retail:` override already owns, and it is the
copy that went stale.

**Why this is urgent rather than tidy:** we publish 20/60 while billing 4/20 on
enso, and marketing published 3/12 — so the advertised figure has been BELOW the
billed figure. A customer could be charged above the posted price. No external
customer has ever been billed for Enso (all usage rows are internal orgs
`hanzo`, `maxpower`, and synthetic `gateprobe-*`), so there are no affected
invoices; the exposure is claims, not refunds. That is timing, not design.

**Recommendation** (one way to do everything): the catalog's `retail:` block
should be the single owner, because it is already the thing the billing engine
charges from — a published price that cannot be charged is not a price. Keep the
`m.pricing ||` precedence for *metadata* (names, descriptions, tiers) and make
retail follow the serving family, then rewrite the test to assert that published
retail EQUALS billed retail rather than that it may differ. If instead the
published number must stay independently settable, it needs to be reviewed
whenever the catalog reprices, and the test should assert
`published >= billed` so it can never again advertise under the charge.

### Related, verified, and not addressed here

- **This service has been undeployable since 2026-07-27.** `Dockerfile:10` is
  `COPY package.json package-lock.json ./`, but `f93599c build: move pricing to
  pnpm` deleted that lockfile — only `pnpm-lock.yaml` exists and
  `package-lock.json` is gitignored. The build cannot resolve the COPY, and
  `--frozen-lockfile` would fail regardless. Needs
  `COPY package.json pnpm-lock.yaml ./`. Nothing merged since that date has
  reached production, so the price question is currently moot in production
  anyway — **fixing the Dockerfile would ship whichever number is in
  `models.mjs` at that moment**, so settle the number first.
- **A third answer exists at the edge.** `hanzoai/catalog/src/snapshot.js` is the
  worker's bundled cold-start fallback, `__generated 2026-07-22` — the day before
  the reprice — and holds enso 20/60, flash 2/6, ultra 40/120. Regenerated by
  `npm run snapshot`; that repo has no CI.
- **And a fourth.** `hanzoai/cloud/go.mod` pins `github.com/hanzoai/pricing
  v1.3.0`, whose embedded `data/pricing.json` is dated 2026-03-14 and contains no
  enso models at all. Authenticated callers reach this path.
- The worker's KV entries carry no `expirationTtl` and it exposes no purge
  endpoint, so an origin roll alone does not refresh the edge; it needs
  `wrangler kv key delete` on `/v1/pricing`, `/v1/models`,
  `/v1/pricing/summary` plus a CF `purge_cache`, then a priming GET. (Cache
  mechanics reported by an investigating agent, not independently verified.)
