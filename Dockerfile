FROM node:24-bookworm-slim AS base

ENV COREPACK_HOME=/home/node/.cache/node/corepack \
    PNPM_HOME=/home/node/.local/share/pnpm \
    PATH=/home/node/.local/share/pnpm:$PATH

RUN corepack enable
WORKDIR /workspace
RUN mkdir -p /workspace/node_modules && chown -R node:node /workspace
USER node

FROM base AS dev
WORKDIR /workspace
CMD ["node"]

FROM base AS build
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @quisera/shared run build \
    && pnpm --filter @quisera/api run build \
    && pnpm --filter @quisera/web run build \
    && pnpm --filter @quisera/api deploy --prod /workspace/runtime

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    SQLITE_PATH=/data/quisera.sqlite \
    WEB_ASSETS_DIR=/app/public
WORKDIR /app
COPY --from=build --chown=node:node /workspace/runtime /app
COPY --from=build --chown=node:node /workspace/apps/api/dist /app/dist
COPY --from=build --chown=node:node /workspace/apps/api/drizzle /app/drizzle
COPY --from=build --chown=node:node /workspace/apps/web/dist /app/public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
