FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# The browser talks only to this app; next.config.ts forwards /aegra and /friday
# to these addresses (service names inside the compose network).
ARG AEGRA_INTERNAL_URL=http://friday:2026
ARG FRIDAY_INTERNAL_URL=http://bot:8100
ARG NEXT_PUBLIC_ASSISTANT_ID=friday
ENV AEGRA_INTERNAL_URL=$AEGRA_INTERNAL_URL \
    FRIDAY_INTERNAL_URL=$FRIDAY_INTERNAL_URL \
    NEXT_PUBLIC_ASSISTANT_ID=$NEXT_PUBLIC_ASSISTANT_ID \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ARG AEGRA_INTERNAL_URL=http://friday:2026
ARG FRIDAY_INTERNAL_URL=http://bot:8100
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    AEGRA_INTERNAL_URL=$AEGRA_INTERNAL_URL FRIDAY_INTERNAL_URL=$FRIDAY_INTERNAL_URL

COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/next.config.ts ./

USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
