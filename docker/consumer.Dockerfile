FROM node:20-alpine AS build
WORKDIR /repo
COPY . .
RUN npm ci \
  && npm run build -w @notification/contracts \
  && npm run build -w @notification/consumer \
  && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /repo
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/package.json ./package.json
COPY --from=build /repo/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /repo/apps/consumer/package.json ./apps/consumer/package.json
COPY --from=build /repo/apps/consumer/dist ./apps/consumer/dist
WORKDIR /repo/apps/consumer
ENV NODE_ENV=production
EXPOSE 3002
CMD ["node", "dist/main.js"]
