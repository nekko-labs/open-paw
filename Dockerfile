# syntax=docker/dockerfile:1

# ---- builder: install + build the whole monorepo (web edition) ----
FROM node:20-slim AS builder
WORKDIR /app

# Electron is a devDependency of @open-paw/desktop; the web edition only needs the
# renderer build, so skip downloading the (large) Electron binary.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY packages/host/package.json packages/host/
COPY apps/desktop/package.json apps/desktop/
COPY apps/server/package.json apps/server/
RUN npm ci

COPY . .
RUN npm run build:web
# Drop dev dependencies so the runtime image stays lean.
RUN npm prune --omit=dev

# ---- runtime: just Node + the built artifacts ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    OPENPAW_HOST=0.0.0.0 \
    OPENPAW_PORT=4317 \
    OPENPAW_DATA_DIR=/data

# Copy the pruned install + build outputs, preserving the workspace layout the
# server expects (apps/server/dist resolves ../../desktop/out/renderer).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/desktop/out/renderer ./apps/desktop/out/renderer

RUN mkdir -p /data /workspace && chown -R node:node /data /workspace /app
USER node

EXPOSE 4317
VOLUME ["/data", "/workspace"]

CMD ["node", "apps/server/dist/index.js"]
