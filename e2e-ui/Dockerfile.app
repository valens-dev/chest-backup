# ssh2 has no prebuilt native for Node 26 and its C++ build fails there, so the
# dependency install + build runs on Node 22; the runtime stays on bun (Node 26).
FROM node:22-slim AS build
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends python3 make g++ >/dev/null && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@12 && curl -fsSL https://bun.sh/install | bash && ln -sf /root/.bun/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM oven/bun:1.4.4
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends postgresql-client sqlite3 docker-cli openssh-client >/dev/null && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
EXPOSE 5199
CMD ["bun", "run", "packages/api/dist/index.js"]
