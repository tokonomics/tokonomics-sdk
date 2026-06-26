FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json yarn.lock ./
COPY apps/worker/package.json ./apps/worker/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
RUN yarn install --frozen-lockfile --production=false

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn workspace @tokonomics/db prisma generate
RUN yarn workspace @tokonomics/worker build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/worker/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=10s \
  CMD wget -qO- http://localhost:8081/health || exit 1

CMD ["node", "dist/index.js"]
