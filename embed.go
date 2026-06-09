// Package pricing embeds the @hanzo/pricing catalog (data/pricing.json), the
// commerce-local plan fragments (plans-extra/), and the goja bundle so the
// unified hanzoai/cloud binary can serve /v1/pricing/* in-process via the
// dop251/goja engine — without copying any pricing source into the cloud repo.
//
// The Node service (src/server.mjs Express app + src/sync.mjs) remains the
// primary artifact. Express cannot run in goja, so goja/bundle.js is the
// ESM-free port of the read handlers + the markup transforms. This Go file is
// a read-only embed surface:
//   - Bundle()      goja/bundle.js for the host to run in goja.
//   - Pricing()     data/pricing.json decoded (globalThis.__PRICING_DATA__).
//   - PlansExtra()  iam/base/paas fragments (globalThis.__PLANS_EXTRA__).
//
// HIP-0106 module-boundary rule: the markup logic stays here (in the bundle,
// in this private repo); the cloud wrapper only orchestrates.
package pricing

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
)

//go:embed goja/bundle.js
//go:embed data/pricing.json
//go:embed plans-extra/iam.json plans-extra/base.json plans-extra/paas.json
var assets embed.FS

// Bundle returns the goja bundle source (goja/bundle.js).
func Bundle() ([]byte, error) {
	return assets.ReadFile("goja/bundle.js")
}

// Pricing returns data/pricing.json decoded to a generic JSON value. The host
// injects this as globalThis.__PRICING_DATA__. This is the synced catalog
// shipped in the repo; a live deployment may overwrite it at runtime via the
// sync path, but the embedded copy guarantees the endpoint serves immediately.
func Pricing() (any, error) {
	b, err := assets.ReadFile("data/pricing.json")
	if err != nil {
		return nil, fmt.Errorf("pricing: read embedded pricing.json: %w", err)
	}
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return nil, fmt.Errorf("pricing: decode embedded pricing.json: %w", err)
	}
	return v, nil
}

// PlansExtra returns the commerce-local plan fragments not yet migrated into
// @hanzo/plans (iam/base/paas), keyed "iam"/"base"/"paas". The host injects
// this as globalThis.__PLANS_EXTRA__.
func PlansExtra() (map[string]any, error) {
	out := make(map[string]any, 3)
	for _, key := range []string{"iam", "base", "paas"} {
		b, err := assets.ReadFile("plans-extra/" + key + ".json")
		if err != nil {
			return nil, fmt.Errorf("pricing: read embedded plans-extra/%s.json: %w", key, err)
		}
		var v any
		if err := json.Unmarshal(b, &v); err != nil {
			return nil, fmt.Errorf("pricing: decode embedded plans-extra/%s.json: %w", key, err)
		}
		out[key] = v
	}
	return out, nil
}

// Assets exposes the raw embedded FS.
func Assets() fs.FS { return assets }
