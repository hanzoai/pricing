#!/bin/sh
# Sync the canonical hanzoai/plans content into ./plans/. Run after any
# update to ~/work/hanzo/plans so the pricing service's /v1/plans
# response matches the SOT exactly.
#
# Usage:
#   scripts/sync-plans-from-canonical.sh
#   PLANS_DIR=/path/to/plans scripts/sync-plans-from-canonical.sh
set -eu
PLANS_DIR=${PLANS_DIR:-$HOME/work/hanzo/plans}
DEST=$(cd "$(dirname "$0")/.." && pwd)/plans
[ -f "$PLANS_DIR/subscription.json" ] || { echo "fatal: $PLANS_DIR/subscription.json missing"; exit 1; }
for f in subscription.json blockchain.json plans.json regions.json storage.json tools.json gpu.json pricing-policy.json ; do
  [ -f "$PLANS_DIR/$f" ] || continue
  cp "$PLANS_DIR/$f" "$DEST/$f"
  echo "synced $f"
done
