FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime

LABEL org.opencontainers.image.description="ServiceTitan MCP server runtime image"

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build

# Default: SSE server for remote access (Fly.io / Docker)
# Override with CMD ["node", "build/index.js"] for stdio mode
CMD ["node", "build/sse.js"]
