# Single image for the NestJS API and the BullMQ worker. Pick one with
#   docker build --build-arg APP=api .      (default)
#   docker build --build-arg APP=worker .
#
# Workspace packages are consumed from source (see ADR 0004), so the image
# runs TypeScript directly with tsx instead of shipping a dist/ folder.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY apps/web/package.json apps/web/
COPY packages/domain/package.json packages/domain/
COPY packages/shared/package.json packages/shared/
COPY packages/features/package.json packages/features/
COPY packages/prediction/package.json packages/prediction/
COPY packages/scraping/package.json packages/scraping/
COPY packages/normalization/package.json packages/normalization/
COPY packages/database/package.json packages/database/
RUN npm ci --ignore-scripts

FROM node:22-alpine AS runtime
ARG APP=api
ENV NODE_ENV=production \
    APP=${APP}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker

USER node
EXPOSE 3000
# Platform injects env vars; no .env file inside the image.
CMD ["sh", "-c", "exec npx tsx --tsconfig apps/${APP}/tsconfig.json apps/${APP}/src/main.ts"]
