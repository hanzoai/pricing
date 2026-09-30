// The public projection of the catalog.
//
// `_internal` holds values that are not part of the public catalog. publicView
// strips it recursively, at every exit and from every section, so a section
// added later is covered without touching a call site.
//
// The public surface is anonymous and edge-cached, so it strips unconditionally
// rather than varying by caller: a response that changes with a token cannot be
// safely cached at a CDN.
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
