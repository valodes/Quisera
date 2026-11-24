FROM node:26-bookworm-slim AS base

ENV PNPM_HOME=/home/node/.local/share/pnpm \
    PATH=/home/node/.local/share/pnpm:$PATH

RUN npm install -g --allow-scripts=pnpm pnpm@12.23.0
WORKDIR /workspace
RUN mkdir -p /workspace/node_modules \
    /workspace/apps/web/node_modules \
    /workspace/apps/api/node_modules \
    /workspace/packages/shared/node_modules \
    && chown -R node:node /workspace
USER node

FROM base AS dev
WORKDIR /workspace
CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm dev"]

FROM base AS build
COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile \
    && pnpm --filter @quisera/shared run build \
    && pnpm --filter @quisera/api run build \
    && pnpm --filter @quisera/web run build \
    && pnpm --filter @quisera/api deploy --prod /workspace/runtime

FROM node:26-bookworm-slim AS runtime
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
