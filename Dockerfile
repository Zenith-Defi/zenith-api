FROM node:22-alpine

WORKDIR /app
RUN corepack enable

# Install with the lockfile first so the layer caches across source changes.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production

# The API listens on PORT (Render injects it). Workers ignore it. Migrations
# read ./src/migrations at runtime, which is why the source tree is kept in the
# image. The default command runs the API; the worker and watcher services
# override it (see render.yaml).
EXPOSE 8787
CMD ["node", "dist/index.js"]
