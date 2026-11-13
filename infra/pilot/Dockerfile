# Linux dependencies are built here; host dependencies and secrets are excluded.
FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
RUN npm install --global pnpm@10.34.7
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/platform/package.json apps/platform/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/server-crypto/package.json packages/server-crypto/package.json
COPY packages/ui-tokens/package.json packages/ui-tokens/package.json
COPY packages/migration-cli/package.json packages/migration-cli/package.json
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1 FLUIVIX_CONTAINER_BUILD=true
ARG PUBLIC_API_URL
RUN test -n "$PUBLIC_API_URL"
ENV NEXT_PUBLIC_API_URL=$PUBLIC_API_URL
RUN node -e 'const u=new URL(process.env.NEXT_PUBLIC_API_URL); if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.pathname!=="/api/v1") throw new Error("PUBLIC_API_URL_REQUIRES_CREDENTIAL_FREE_HTTPS_API_V1")'
RUN node infra/pilot/prepare-migrations.mjs && pnpm db:generate
RUN pnpm exec turbo run build --filter=@fluivix/api --filter=@fluivix/worker --filter=@fluivix/web --filter=@fluivix/platform
RUN node infra/pilot/prepare-runtime.mjs \
    && pnpm --dir /runtime install --prod --offline --frozen-lockfile --ignore-scripts \
    && pnpm --dir /runtime-migration install --prod --offline --frozen-lockfile --ignore-scripts
# Prisma generates into the virtual store; deployment must retain that client.
RUN node infra/pilot/copy-prisma-client.mjs /runtime/apps/api /runtime/apps/worker

FROM base AS service
COPY --from=build --chown=node:node /runtime /app
COPY --chown=node:node infra/pilot/entrypoint.mjs /app/entrypoint.mjs
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "/app/entrypoint.mjs"]

FROM service AS api
CMD ["api"]

FROM service AS worker
CMD ["worker"]

FROM base AS migrate
COPY --from=build /runtime-migration /app
COPY --from=build /app/infra/prisma /app/infra/prisma
COPY --chown=node:node infra/pilot/entrypoint.mjs /app/entrypoint.mjs
USER node
ENV NODE_ENV=production
ENTRYPOINT ["node", "/app/entrypoint.mjs"]
CMD ["migrate"]

FROM base AS web
COPY --from=build --chown=node:node /app/apps/web/.next/standalone /app
COPY --from=build --chown=node:node /app/apps/web/.next/static /app/apps/web/.next/static
USER node
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 NEXT_TELEMETRY_DISABLED=1
CMD ["node", "apps/web/server.js"]

FROM base AS platform
COPY --from=build --chown=node:node /app/apps/platform/.next/standalone /app
COPY --from=build --chown=node:node /app/apps/platform/.next/static /app/apps/platform/.next/static
USER node
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3001 NEXT_TELEMETRY_DISABLED=1
CMD ["node", "apps/platform/server.js"]

FROM scratch AS context-audit
COPY . /context

# Verification only: use the locked Linux compiler without changing host policy.
FROM dependencies AS all-dependencies
COPY apps/mobile/package.json apps/mobile/package.json
RUN pnpm install --frozen-lockfile

FROM all-dependencies AS all-builds
COPY . .
ARG PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$PUBLIC_API_URL EXPO_PUBLIC_API_BASE_URL=$PUBLIC_API_URL NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1 CI=1
RUN node -e 'const u=new URL(process.env.NEXT_PUBLIC_API_URL); if(u.protocol!=="https:"||u.username||u.password||u.search||u.hash||u.pathname!=="/api/v1") throw new Error("PUBLIC_API_URL_REQUIRES_CREDENTIAL_FREE_HTTPS_API_V1")'
RUN pnpm db:generate && pnpm build --force --concurrency=1
RUN node infra/pilot/verify-mobile-export.mjs

FROM scratch AS build-evidence
COPY --from=all-builds /app/.cache/mobile-export-verification.json /mobile-export-verification.json
COPY --from=all-builds /app/apps/mobile/dist /mobile-export
