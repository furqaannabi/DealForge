# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (includes dev — needed for prisma CLI + tsc)
COPY api/package*.json ./
RUN npm install

# Copy source files (prisma.config.ts intentionally excluded — generate
# does not need a DB URL and the config would fail to resolve DATABASE_URL)
COPY api/tsconfig.json ./
COPY api/prisma ./prisma
COPY api/src ./src
COPY shared ../shared

# Generate Prisma client (schema only, no DB connection needed)
RUN npx prisma generate

# Compile TypeScript → dist/
RUN npm run build

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Copy package manifests
COPY api/package*.json ./

# Copy node_modules from builder (includes prisma CLI for db push at startup)
COPY --from=builder /app/node_modules ./node_modules

# Copy Prisma config directly from build context (needed by db push at runtime)
COPY api/prisma.config.ts ./

# Copy Prisma schema (required for db push at startup)
COPY --from=builder /app/prisma ./prisma

# Copy generated Prisma client
COPY --from=builder /app/generated ./generated

# Copy compiled JavaScript
COPY --from=builder /app/dist ./dist

# Copy and make entrypoint executable
COPY api/docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
