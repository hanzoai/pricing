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

This service does not serve `/v1/pricing/subscriptions`, `/v1/plans` or
`/v1/subscriptions`: one answer on one host. `goja/bundle.js` keeps its
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

## Enso retail price — owned by commerce

`commerce` owns the Enso retail price (`models/catalogentry/seed/enso-models.json`,
pinned per SKU by `seed_test.go`) and `cloud/apps/pricing/commerce.go` publishes
first-party prices from that catalog. The enso service meters from its own
mounted catalog (`retail:` in `catalog-enso.yaml`), a replica held equal by test
so billing never takes a runtime dependency on commerce.

`ensoCatalog` in `src/models.mjs` is a further replica; `test/enso-rates.test.mjs`
holds it equal to those owners. Retail is set by us, never derived from an
upstream's price: commerce separates `Cost` (written only by a sync) from `Price`
(set only in admin), and `UpsertModels` strips any price a syncer states.

Supplier costs, markups and plan-to-supplier routing are not part of this
repository; `_internal` carries only a sync's own provenance, and `publicView`
strips it from every response.

## License

Dual-licensed `MIT OR Apache-2.0` (`LICENSE-MIT`, `LICENSE-APACHE`), at the
user's option. Relicensed from BSD-3-Clause under HIP-0137 "One License"
(`hanzoai/hips`), which standardises original Hanzo work on the dual
permissive pair. The prior BSD copyright line carries forward unchanged
into `LICENSE-MIT`.
