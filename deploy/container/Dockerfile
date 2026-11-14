FROM node:22.22.2-bookworm-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e

WORKDIR /app
ENV NODE_ENV=production
# PostgreSQL's bundled Linux executable needs these shared libraries.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libicu72 libssl3 libxml2 liblz4-1 libzstd1 zlib1g && rm -rf /var/lib/apt/lists/*
COPY tests/sandbox/package*.json tests/sandbox/
COPY services/indexer/package*.json services/indexer/
COPY apps/web/package*.json apps/web/
RUN npm ci --prefix tests/sandbox --ignore-scripts --no-audit --no-fund \
    && npm ci --prefix services/indexer --include=dev --no-audit --no-fund \
    && npm ci --prefix apps/web --include=dev --no-audit --no-fund
COPY services/ services/
COPY packages/ packages/
COPY apps/web/ apps/web/
COPY tests/indexer/postgres.mjs tests/indexer/postgres.mjs
COPY deploy/container/ deploy/container/
COPY deploy/testnet/expiry-deployment.json deploy/testnet/expiry-deployment.json
RUN npm run build:wallet --prefix apps/web \
    && mkdir -p /app/.local/testnet /app/target \
    && chown -R node:node /app/.local /app/target
USER node
STOPSIGNAL SIGTERM
# Loopback-only service. No public port until authenticated gateway acceptance.
ENTRYPOINT ["/bin/sh", "/app/deploy/container/start.sh"]
