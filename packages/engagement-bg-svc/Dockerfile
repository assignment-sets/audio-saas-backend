# ==========================================
# STAGE 1: Build & Compile
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./

# Fast, deterministic installation of all deps
RUN npm ci

COPY . .

RUN npm run build

# ==========================================
# STAGE 2: Production Execution
# ==========================================
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./

# Install production-only dependencies
RUN npm ci --omit=dev

COPY --chown=node:node --from=builder /app/dist ./dist

# Run as non-root user for security
USER node

CMD ["node", "dist/src/index.js"]