# syntax=docker/dockerfile:1

# Multi-stage build for the AI Drama Next.js frontend.
# Produces a small image that runs the standalone server (output: "standalone"
# in next.config.ts). Build with the deploy-to-docker.sh script or directly:
#   docker build -t aidrama-frontend .
#   docker run -p 3000:3000 aidrama-frontend

# ---- Base ---------------------------------------------------------------
# Node 22 LTS on Alpine. Next 16 / React 19 require Node >= 20.
FROM node:22-alpine AS base
# libc6-compat helps some native deps run on Alpine.
RUN apk add --no-cache libc6-compat

# ---- Dependencies -------------------------------------------------------
FROM base AS deps
WORKDIR /app
# Install from the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build --------------------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time config. These are baked into the build:
#   - NEXT_PUBLIC_API_BASE_URL is inlined into the browser bundle. Normally
#     LEAVE IT EMPTY so the browser calls the same-origin /api/v1 proxy; the
#     server reaches the backend via API_INTERNAL_BASE_URL (a RUNTIME env, not
#     baked, set at `docker run`). Set it only to send the browser straight at
#     an absolute API host.
#   - MEDIA_IMAGE_HOSTS whitelists next/image remote hosts (server-side only).
# Override at build time:
#   docker build \
#     --build-arg NEXT_PUBLIC_API_BASE_URL=http://192.168.100.44:8080/api/v1 \
#     --build-arg MEDIA_IMAGE_HOSTS=http://192.168.100.50:8333 \
#     -t aidrama-frontend .
ARG NEXT_PUBLIC_API_BASE_URL=""
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ARG MEDIA_IMAGE_HOSTS=""
ENV MEDIA_IMAGE_HOSTS=${MEDIA_IMAGE_HOSTS}
# Allow the image optimizer to fetch media from private/LAN IPs (e.g. a
# SeaweedFS host on 192.168.x.x). Only set this for trusted LAN deployments.
ARG ALLOW_LOCAL_IP_IMAGES=""
ENV ALLOW_LOCAL_IP_IMAGES=${ALLOW_LOCAL_IP_IMAGES}
RUN npm run build

# ---- Runner -------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone output: server.js plus the traced node_modules it needs.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# Static assets are not copied into standalone by default; the server serves
# them from here once present.
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
