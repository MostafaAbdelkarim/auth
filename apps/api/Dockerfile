# syntax=docker/dockerfile:1
# Build context: repository root (npm workspaces share one lockfile).

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/api --include-workspace-root=false
COPY apps/api apps/api
RUN npm run build -w apps/api && npm prune --omit=dev -w apps/api

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
# Patch OS packages at build time, and remove the package managers that ship with the base image:
# the container only runs `node dist/main.js`, and the bundled npm CLI carries its own CVEs
# (found by the Trivy scan in CI).
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* \
            /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
COPY --from=build --chown=node:node /repo/apps/api/package.json ./
# Daily log files when LOG_DIR points here; mount a volume so they outlive the container.
RUN mkdir -p /var/log/auth-api && chown node:node /var/log/auth-api
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "dist/main.js"]
