FROM node:20-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci \
  && npm run build -w @notification/telegram \
  && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/apps/telegram/package.json ./apps/telegram/package.json
COPY --from=build /repo/apps/telegram/dist ./apps/telegram/dist
WORKDIR /repo/apps/telegram
ENV NODE_ENV=production
EXPOSE 3003
CMD ["node", "dist/main.js"]
