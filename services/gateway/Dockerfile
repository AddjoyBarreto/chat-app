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
COPY --from=deps /app/ ./
COPY tsconfig.base.json ./
COPY packages/protocol/src ./packages/protocol/src
COPY packages/protocol/tsconfig.json ./packages/protocol/
COPY packages/crypto/src ./packages/crypto/src
COPY packages/crypto/tsconfig.json ./packages/crypto/
COPY packages/db/src ./packages/db/src
COPY packages/db/tsconfig.json ./packages/db/
COPY packages/db/drizzle.config.ts ./packages/db/
COPY packages/db/env.ts ./packages/db/
COPY packages/api-core/src ./packages/api-core/src
COPY packages/api-core/tsconfig.json ./packages/api-core/
COPY services/gateway/src ./services/gateway/src
COPY services/gateway/tsconfig.json ./services/gateway/

RUN set -eux \
  && mkdir -p packages/api-core/node_modules/@vaultchat \
  && ln -sfn ../../../db packages/api-core/node_modules/@vaultchat/db \
  && ln -sfn ../../../crypto packages/api-core/node_modules/@vaultchat/crypto \
  && ln -sfn ../../../protocol packages/api-core/node_modules/@vaultchat/protocol \
  && mkdir -p packages/crypto/node_modules/@vaultchat \
  && ln -sfn ../../../protocol packages/crypto/node_modules/@vaultchat/protocol \
  && mkdir -p services/gateway/node_modules/@vaultchat \
  && ln -sfn ../../../../packages/api-core services/gateway/node_modules/@vaultchat/api-core \
  && ln -sfn ../../../../packages/protocol services/gateway/node_modules/@vaultchat/protocol

RUN pnpm --filter @vaultchat/protocol build \
 && pnpm --filter @vaultchat/crypto build \
 && pnpm --filter @vaultchat/db build \
 && pnpm --filter @vaultchat/api-core build \
 && pnpm --filter @vaultchat/gateway build

WORKDIR /app/packages/api-core
RUN node --input-type=module -e "import('@vaultchat/db').then(() => console.log('db ok'))"
WORKDIR /app/services/gateway
RUN node --input-type=module -e "import('@vaultchat/api-core').then(() => console.log('api-core ok'))"
WORKDIR /app

# Full CJS bundle (curve25519 needs __dirname; CJS provides it). No externals.
RUN npm install -g esbuild@0.25.5 \
 && esbuild services/gateway/dist/index.js \
      --bundle \
      --platform=node \
      --target=node22 \
      --format=cjs \
      --outfile=/app/gateway.cjs \
 && test -f /app/gateway.cjs

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build /app/gateway.cjs ./gateway.cjs
EXPOSE 3001
CMD ["node", "gateway.cjs"]
