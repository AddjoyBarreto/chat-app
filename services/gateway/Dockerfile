FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY services/gateway/package.json ./services/gateway/
RUN pnpm install --frozen-lockfile --filter @vaultchat/gateway...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/services/gateway/node_modules ./services/gateway/node_modules
COPY . .
RUN pnpm --filter @vaultchat/protocol build \
 && pnpm --filter @vaultchat/db build \
 && pnpm --filter @vaultchat/api-core build \
 && pnpm --filter @vaultchat/gateway build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/services/gateway/dist ./dist
COPY --from=build /app/services/gateway/package.json ./
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/index.js"]
