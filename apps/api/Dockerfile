FROM node:20-alpine AS base
WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

COPY . .

RUN npm run prisma:generate -w @pillcount/api \
  && npm run build -w @pillcount/shared \
  && npm run build -w @pillcount/api

EXPOSE 4000

CMD ["sh", "-c", "npm run prisma:generate -w @pillcount/api && npm run prisma:push -w @pillcount/api && npm run start -w @pillcount/api"]
