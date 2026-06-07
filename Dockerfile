# syntax=docker/dockerfile:1
# Hanzo Pricing — Express server over the canonical @hanzo/plans catalog.
#
# Decomplected: the plans data is NOT vendored into this repo. It lives
# in hanzoai/plans (private). The CI pre-build step clones it into
# ./plans/ before `docker build` runs (see .github/workflows/deploy.yml
# pre-build-command). Local dev mirrors via `scripts/fetch-plans.sh`.
# Plans is gitignored — there is one and only one source.

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production --ignore-scripts
COPY src ./src
COPY data ./data
COPY datastore.json ./datastore.json
COPY plans ./plans
EXPOSE 8080
CMD ["node", "src/server.mjs"]
