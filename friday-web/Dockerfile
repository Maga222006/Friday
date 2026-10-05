FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* are baked into the browser bundle at build time. The browser
# runs on your machine, so these are the host-published ports, not service names.
ARG NEXT_PUBLIC_LANGGRAPH_API_URL=http://localhost:2026
ARG NEXT_PUBLIC_FRIDAY_API=http://localhost:8100
ARG NEXT_PUBLIC_ASSISTANT_ID=friday
ENV NEXT_PUBLIC_LANGGRAPH_API_URL=$NEXT_PUBLIC_LANGGRAPH_API_URL \
    NEXT_PUBLIC_FRIDAY_API=$NEXT_PUBLIC_FRIDAY_API \
    NEXT_PUBLIC_ASSISTANT_ID=$NEXT_PUBLIC_ASSISTANT_ID \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
