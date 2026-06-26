FROM node:22-alpine AS base
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_DISTURL=https://npmmirror.com/mirrors/node
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apk/repositories \
 && apk add --no-cache python3 make g++ \
 && corepack enable && corepack prepare pnpm@10.15.0 --activate \
 && pnpm config set registry https://registry.npmmirror.com
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile || pnpm install

# Build frontend
FROM deps AS frontend-build
COPY packages/shared packages/shared
COPY apps/frontend apps/frontend
COPY tsconfig.base.json ./
RUN pnpm --filter frontend exec tsc -b --force ../../packages/shared \
 && pnpm --filter frontend build

# Build backend
FROM deps AS backend-build
COPY packages/shared packages/shared
COPY apps/backend apps/backend
COPY tsconfig.base.json ./
RUN pnpm --filter backend build

# Production image
FROM node:22-alpine AS production
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_DISTURL=https://npmmirror.com/mirrors/node
RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apk/repositories \
 && apk add --no-cache python3 make g++ \
 && corepack enable && corepack prepare pnpm@10.15.0 --activate \
 && pnpm config set registry https://registry.npmmirror.com
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod

COPY --from=backend-build /app/apps/backend/dist apps/backend/dist
COPY --from=frontend-build /app/apps/frontend/dist public

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_PATH=/app/data/caiwu.db

VOLUME /app/data
EXPOSE 3000

CMD ["node", "apps/backend/dist/index.js"]
