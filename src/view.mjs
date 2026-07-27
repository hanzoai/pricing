// The public projection of the catalog.
//
// `_internal` is where a value that must not leave the building lives: which
// supplier serves a SKU, what that supplier charges us, and the margin we add.
// publicView strips it from anything served to a caller.
//
// It is recursive and applied at EVERY exit, because the alternative already
// failed: the strip used to live at three call sites that each handled
// `data.cloud` only, so `infrastructure` — added later, nesting the same kind of
// value — published our supplier ("digitalocean"), our cost (basePriceMonthly)
// and our markup to anyone who asked. A rule enforced in three places is a rule
// the fourth section escapes. One seam, no section exempt.
//
// The public surface is anonymous and edge-cached, so it strips unconditionally
// rather than varying by caller: a response that changes with a token cannot be
// safely cached at a CDN — the first privileged answer would be replayed to
// everyone. Cost and margin reach a SuperAdmin through an authenticated,
// uncached surface, never through this one.
//
// It lives in its own module so it can be tested without importing the server,
// whose import boots the listener and runs a sync that rewrites the catalog.
export const publicView = (v) =>
  Array.isArray(v)
    ? v.map(publicView)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([k]) => k !== "_internal")
            .map(([k, x]) => [k, publicView(x)]),
        )
      : v;
