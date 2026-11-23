FROM node:24-alpine AS web-builder

WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json ./apps/web/
RUN npm --prefix apps/web ci

COPY packages/shared ./packages/shared
COPY apps/web ./apps/web

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_GAME_SERVER_URL=""
ARG VITE_GITHUB_AUTH_ENABLED="false"

ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL} \
    VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY} \
    VITE_GAME_SERVER_URL=${VITE_GAME_SERVER_URL} \
    VITE_GITHUB_AUTH_ENABLED=${VITE_GITHUB_AUTH_ENABLED}

RUN npm --prefix apps/web run build

FROM node:24-alpine AS runner

WORKDIR /app

COPY apps/game-server/package.json apps/game-server/package-lock.json ./apps/game-server/
RUN npm --prefix apps/game-server ci

COPY packages/shared ./packages/shared
COPY apps/game-server/tsconfig.json ./apps/game-server/tsconfig.json
COPY apps/game-server/src ./apps/game-server/src
COPY --from=web-builder /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /app/.data && chown -R node:node /app
USER node

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=2567 \
    STATIC_DIR=/app/apps/web/dist

EXPOSE 2567

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 2567) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["npm", "--prefix", "apps/game-server", "run", "start"]
