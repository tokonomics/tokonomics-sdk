FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json yarn.lock ./
COPY apps/ingest/package.json ./apps/ingest/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
RUN yarn install --frozen-lockfile --production=false

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn workspace @tokonomics/db prisma generate
RUN yarn workspace @tokonomics/ingest build

# Production image
FROM base AS runner
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 fastify
COPY --from=builder /app/apps/ingest/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

USER fastify
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost:8080/ingest/v1/health || exit 1

CMD ["node", "dist/index.js"]
