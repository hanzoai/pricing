#!/bin/sh
# fetch-plans.sh — clone hanzoai/plans into ./plans/.
#
# Pricing does NOT vendor the plans data; hanzoai/plans is the SOT.
# Run this once before `docker build` (CI invokes it via the
# pre-build-command input on the canonical docker-build.yml). Local
# devs run it manually after pulling pricing or whenever they want
# to refresh the data.
#
# Env:
#   PLANS_REPO     git URL (default: hanzoai/plans private repo)
#   PLANS_VERSION  branch / tag / sha (default: main)
#   GITHUB_TOKEN   PAT or workflow token with read on hanzoai/plans
#                  (required because the repo is private)

set -eu

PLANS_REPO=${PLANS_REPO:-github.com/hanzoai/plans.git}
PLANS_VERSION=${PLANS_VERSION:-main}
DEST=$(cd "$(dirname "$0")/.." && pwd)/plans

if [ -d "$DEST" ]; then
  rm -rf "$DEST"
fi

if [ -n "${GITHUB_TOKEN:-}" ]; then
  URL="https://x-access-token:${GITHUB_TOKEN}@${PLANS_REPO}"
else
  URL="https://${PLANS_REPO}"
fi

git clone --depth=1 --branch="${PLANS_VERSION}" "$URL" "$DEST"
# Drop dev-only files so the runtime image only carries the data.
rm -rf "$DEST/.git" "$DEST/CLAUDE.md" "$DEST/AGENTS.md" "$DEST/LLM.md"

echo "fetched hanzoai/plans@${PLANS_VERSION} -> $DEST"
