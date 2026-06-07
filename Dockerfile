# syntax=docker/dockerfile:1
# Hanzo Pricing — Express server over the canonical @hanzo/plans catalog.
#
# Decomplected: plans data is the @hanzo/plans npm package. Zero git
# clones, zero vendored copies, zero manual sync. Bump the @hanzo/plans
# dep in package.json to roll the catalog forward.

FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production --ignore-scripts
COPY src ./src
COPY data ./data
COPY datastore.json ./datastore.json
COPY plans-extra ./plans-extra
EXPOSE 8080
CMD ["node", "src/server.mjs"]
