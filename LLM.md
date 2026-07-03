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
