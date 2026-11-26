# syntax=docker/dockerfile:1
# Build context: repository root (npm workspaces share one lockfile).

FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w apps/web --include-workspace-root=false
COPY apps/web apps/web
RUN npm run build -w apps/web

FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime
# Patch OS packages at build time (the Trivy scan in CI fails on fixable HIGH/CRITICAL CVEs),
# then drop back to the image's unprivileged user.
USER root
RUN apk upgrade --no-cache
USER 101
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
