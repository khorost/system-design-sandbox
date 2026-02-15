FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

# Копируем package.json-ы и конфиги для кеширования pnpm install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.json ./
COPY apps/web/package.json apps/web/
COPY packages/simulation-engine/package.json packages/simulation-engine/
COPY packages/component-library/package.json packages/component-library/
COPY packages/scenario-pack/package.json packages/scenario-pack/
RUN pnpm install --frozen-lockfile

# Исходники и сборка
COPY packages/ packages/
COPY apps/web/ apps/web/
RUN pnpm build --filter=web

FROM nginx:1.29.5-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
