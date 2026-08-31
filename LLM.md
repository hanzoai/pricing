# pricing — hanzoai/pricing

`pricing.hanzo.ai` — the public model + pricing catalog aggregator. It is the
**canonical origin** the `hanzoai/catalog` Cloudflare Worker edge-caches; that
worker serves `catalog.hanzo.ai` and nothing else (its `api.hanzo.ai` path-carve
was removed — see that repo's LLM.md). So the model picker in hanzo.chat /
hanzo.app ultimately reads THIS service's `/v1/models`.

## This service does NOT answer the subscription ladder

The ladder — free / go / pro / max / team / enterprise — is **cloud's**, at
`api.hanzo.ai/v1/pricing/subscriptions`, and commerce prices from the same bytes
at `/v1/billing/plans`. One file is behind all of it: `hanzoai/plans`
`subscription.json`, published as npm `@hanzo/plans` AND as a Go module.

This service used to publish it too, on `/v1/pricing/subscriptions`, `/v1/plans`
and `/v1/subscriptions`, out of its own npm install. That made a second answer on
a second host with its own version pin, and the pin is what went wrong: the image
froze at `@hanzo/plans` 1.4.1 while the catalog moved to 1.4.16, so for three
weeks this host served `developer` / `plus` / `team-max` / `custom` at July
prices, and an enterprise line the catalog had already reworded. Two consumers
read the stale copy and one of them baked it into a money page.

Those three routes are gone (2026-08-17). `goja/bundle.js` keeps its
`subscriptions` view because that is the bundle **cloud embeds** — cloud is the
one that answers, so the view belongs to it, not to this HTTP surface.

**A plan catalog does not belong here.** What does: the model catalog and the
infra rate cards — `/v1/models`, `/v1/pricing`, compute, cloud, gpu, datastore,
summary, policy, tools, and the `plans-extra/` fragments (iam, base, paas) that
have not migrated into `@hanzo/plans` yet. Those fragments are the last
hand-maintained plan copy in this repo; when they move, this repo stops defining
a plan at all.

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

`hanzo.yml` drives build, deploy and e2e on platform.hanzo.ai: an in-cluster Kaniko
Job builds `ghcr.io/hanzoai/pricing`, the hanzo operator's `pricing` Service CR
(ns `hanzo`) takes the new tag on `main`, then the pricing e2e runs against the live
service. `server.mjs` syncs on boot + every 6h; the `pricing-sync` CronJob POSTs
`/v1/sync` daily. The catalog worker's own cron
(`0 6 * * *`) then re-primes its KV/edge from this origin.

## DECIDED — the Enso retail price is owned by commerce

**The owner is the catalog in commerce.hanzo.ai.** Decided 2026-08-01; the
history below is kept because it explains what the old test was defending.

What landed:

- `commerce` seeds the Enso family at the price enso BILLS
  (`models/catalogentry/seed/enso-models.json`, released v1.49.37), and
  `models/catalogentry/seed_test.go` pins each SKU to that number so a published
  price cannot move on its own again.
- `cloud/apps/pricing/commerce.go` publishes first-party prices from that
  catalog instead of the embedded `data/pricing.json`, so `/v1/pricing` stops
  serving a 2026-03-14 snapshot that contained no Enso rows at all.
- `hanzo.ai` gained `scripts/audit-price-literals.mjs`, which fails the build on
  a second copy of a rate.

**This repo is no longer the owner of that number.** `src/models.mjs`'s
`ensoCatalog` prices (~522/532/542) and the `m.pricing ||` precedence at
`src/sync.mjs:1091` are now a THIRD copy of a number commerce owns, and they
still hold the pre-reprice 20/60, 2/6, 40/120. Retiring them is follow-up work.

⚠️ The reason given here for leaving them — "this service has not deployed since
2026-07-27, so nothing it says currently reaches production" — **expired on
2026-08-17.** The Dockerfile is fixed, the service deploys on every push, and
`data/pricing.json` now carries the 2026-08-06 sync (enso 4/20, flash 2/4, ultra
5/25). So these copies DO reach production now, and the argument for not touching
them is gone with it.

When it is retired, the test at `test/vendor-naming.test.mjs:141` ("enso owns
the window; we own the price") goes with it. **What that test was defending was
real and must not be lost**: retail is set by US, not derived from whatever an
upstream happens to charge, so an upstream price move can never silently
reprice a customer. That concern is now met more strictly, not abandoned —
commerce separates `Cost` (written only by a sync) from `Price` (set only in
admin), and `UpsertModels` strips any price a syncer tries to state. The policy
survives; what changed is that it is enforced in the one place that owns the
number, instead of by a local copy that could — and did — go stale.

---

The original finding, kept for context:

One number had two owners, and they disagreed:

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

**What was decided, and how it differs from the recommendation above.** The
recommendation was to make the enso catalog's `retail:` block the single owner,
since it is what the billing engine already charges from. The decision went one
step further: **commerce owns the number, and the enso catalog is a replica.**

The reason is availability, not tidiness. Billing must not take a runtime
dependency on commerce — a charge that fails when commerce is unreachable is
strictly worse than one reading a local copy. So enso keeps metering from its
own mounted catalog exactly as before, and equality is held by a test rather
than by a network call. One owner, many readers, and the money path reads a
local copy that CI proves equal.

The "published >= billed" fallback is moot: published now IS billed, from one
source, so it cannot advertise under the charge.

### Related, verified, and not addressed here

- **This service was undeployable from 2026-07-27 to 2026-08-17** — `Dockerfile:10`
  read `COPY package.json package-lock.json ./` after `f93599c build: move pricing
  to pnpm` deleted that lockfile. Fixed (`COPY package.json pnpm-lock.yaml ./`),
  and the image now rolls on every push to the forge. The cost of that gap was not
  only stale prices: for three weeks the service published a subscription ladder
  the catalog had retired on 2026-08-01, and no edit anywhere could change it.
- **A third answer existed at the edge.** `hanzoai/catalog/src/snapshot.js`, the
  worker's bundled cold-start fallback, was `__generated 2026-07-22` — the day
  before the reprice. Regenerated 2026-08-17; that repo still has no CI, so it is
  refreshed by hand (`npm run snapshot && npx wrangler deploy`).
- **And a fourth.** `hanzoai/cloud/go.mod` pins `github.com/hanzoai/pricing
  v1.3.0`, whose embedded `data/pricing.json` is dated 2026-03-14 and contains no
  enso models at all. Authenticated callers reach this path.
- The worker's KV entries carry no `expirationTtl` and it exposes no purge
  endpoint, so an origin roll alone does not refresh the edge; it needs
  `wrangler kv key delete` on `/v1/pricing`, `/v1/models`,
  `/v1/pricing/summary` plus a CF `purge_cache`, then a priming GET. (Cache
  mechanics reported by an investigating agent, not independently verified.)

## License

Dual-licensed `MIT OR Apache-2.0` (`LICENSE-MIT`, `LICENSE-APACHE`), at the
user's option. Relicensed from BSD-3-Clause under HIP-0137 "One License"
(`hanzoai/hips`), which standardises original Hanzo work on the dual
permissive pair. The prior BSD copyright line carries forward unchanged
into `LICENSE-MIT`.
