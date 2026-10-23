# One multi-stage build for every app. Pick the runtime with --target api|worker|web|admin
# (docker-compose.yml does this for you).
FROM node:22-alpine AS base
RUN npm install -g pnpm@12.14.0
WORKDIR /repo

# ── build the whole workspace once ──
FROM base AS build
# API_URL is baked into the Next.js rewrites (/api → API) at build time.
ARG API_URL=http://api:4000
ENV API_URL=$API_URL NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build

# ── API (runs migrations on start) ──
FROM base AS api
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["sh", "-c", "cd /repo/packages/db && npx prisma migrate deploy && cd /repo/apps/api && node dist/main.js"]

# ── worker (BullMQ jobs) ──
FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /repo /repo
WORKDIR /repo/apps/worker
CMD ["node", "dist/main.js"]

# ── user frontend ──
FROM node:22-alpine AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# ── admin frontend ──
FROM node:22-alpine AS admin
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build /repo/apps/admin/.next/standalone ./
COPY --from=build /repo/apps/admin/.next/static ./apps/admin/.next/static
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
