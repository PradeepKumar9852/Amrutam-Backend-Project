# =========================================================================
# AMRUTAM TELEMEDICINE BACKEND - PRODUCTION DOCKERFILE
# Multi-stage, security-hardened, non-root Node.js 22 container
# =========================================================================

# -------------------------------------------------------------------------
# Stage 1: Dependencies & Prisma Generation
# -------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install OpenSSL and libc dependencies required by Prisma engine on Alpine Linux
RUN apk add --no-cache openssl libc6-compat

# Copy dependency manifests
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including devDependencies required for Prisma generation)
RUN npm install

# Generate Prisma Client specifically compiled for Linux Alpine
RUN npx prisma generate

# -------------------------------------------------------------------------
# Stage 2: Production Runtime
# -------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

# Install OpenSSL and wget for runtime and health checks
RUN apk add --no-cache openssl libc6-compat wget

# Set production environment defaults (overrideable via docker-compose / env)
ENV NODE_ENV=production
ENV PORT=5000

# Copy node_modules and generated Prisma client from builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Copy application source code
COPY src ./src

# Set ownership of application files to unprivileged 'node' user
RUN chown -R node:node /app

# Switch to unprivileged 'node' user for security compliance (Principle of Least Privilege)
USER node

# Expose HTTP port
EXPOSE 5000

# Container Healthcheck (Verifies HTTP 200 from the healthcheck endpoint)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/v1/health || exit 1

# Start the Express server
CMD ["node", "src/server.js"]
