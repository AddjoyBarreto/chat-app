FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.11.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/crypto/package.json ./packages/crypto/
COPY packages/db/package.json ./packages/db/
COPY packages/api-core/package.json ./packages/api-core/
COPY services/gateway/package.json ./services/gateway/
RUN pnpm install --frozen-lockfile --filter @vaultchat/gateway...

FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY --from=deps /app/services ./services
COPY . .
RUN pnpm --filter @vaultchat/protocol build \
 && pnpm --filter @vaultchat/crypto build \
 && pnpm --filter @vaultchat/db build \
 && pnpm --filter @vaultchat/api-core build \
 && pnpm --filter @vaultchat/gateway build \
 && node --input-type=module -e "import('@vaultchat/api-core').then(() => console.log('api-core ok'))"

# Full monorepo runtime layout — pnpm links live under packages/*/node_modules
# and services/gateway/node_modules into root node_modules/.pnpm.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build /app/package.json /app/pnpm-workspace.yaml /app/.npmrc ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/gateway ./services/gateway
WORKDIR /app/services/gateway
EXPOSE 3001
CMD ["node", "dist/index.js"]
