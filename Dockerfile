# ---- Stage 1: Build ----
FROM node:22-slim AS builder

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./
COPY packages/protocol/package*.json ./packages/protocol/
COPY packages/core/package*.json ./packages/core/
COPY apps/server/package*.json ./apps/server/
COPY apps/client/package*.json ./apps/client/

# Install dependencies
RUN npm ci

# Copy source
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY tsconfig.base.json ./

# Build in dependency order
RUN npm run build -w @pro-gyakuten/protocol \
 && npm run build -w @pro-gyakuten/core \
 && npm run build -w @pro-gyakuten/server \
 && npm run build -w @pro-gyakuten/client

# ---- Stage 2: Runtime ----
FROM node:22-slim

WORKDIR /app

# Copy only production dependencies and built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/ ./packages/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/client/dist ./apps/client/dist
COPY --from=builder /app/apps/client/package.json ./apps/client/package.json
COPY package*.json ./

# SQLite data directory
RUN mkdir -p /data
ENV TURSO_URL=file:/data/gyakuten.db

EXPOSE 3001

# Start server
CMD ["npx", "tsx", "apps/server/src/index.ts"]
