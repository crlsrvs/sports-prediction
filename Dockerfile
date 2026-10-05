# API and worker image. Packages are compiled to dist/ (see ADR 0005);
# pick the process with APP=api (default) or APP=worker.
#
#   docker build --build-arg APP=api -t sports-prediction-api .
#   docker build --build-arg APP=worker -t sports-prediction-worker .

FROM node:22-alpine AS build
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
RUN npm ci
COPY tsconfig.base.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps/api ./apps/api
COPY apps/worker ./apps/worker
ENV SKIP_WEB=1
RUN node scripts/build-all.mjs
RUN npm prune --omit=dev

FROM node:22-alpine AS runtime
ARG APP=api
ENV NODE_ENV=production \
    APP=${APP}
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/domain/package.json ./packages/domain/package.json
COPY --from=build /app/packages/domain/dist ./packages/domain/dist
COPY --from=build /app/packages/normalization/package.json ./packages/normalization/package.json
COPY --from=build /app/packages/normalization/dist ./packages/normalization/dist
COPY --from=build /app/packages/prediction/package.json ./packages/prediction/package.json
COPY --from=build /app/packages/prediction/dist ./packages/prediction/dist
COPY --from=build /app/packages/features/package.json ./packages/features/package.json
COPY --from=build /app/packages/features/dist ./packages/features/dist
COPY --from=build /app/packages/scraping/package.json ./packages/scraping/package.json
COPY --from=build /app/packages/scraping/dist ./packages/scraping/dist
COPY --from=build /app/packages/database/package.json ./packages/database/package.json
COPY --from=build /app/packages/database/dist ./packages/database/dist
COPY --from=build /app/packages/database/migrations ./packages/database/migrations

USER node
EXPOSE 3000
CMD ["sh", "-c", "exec node apps/${APP}/dist/main.js"]
