FROM node:20-alpine AS base
WORKDIR /workspace

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

COPY . .

RUN npm run build -w @pillcount/shared \
  && npm run build -w @pillcount/ui \
  && npm run build -w @pillcount/web

EXPOSE 3000

CMD ["npm", "run", "start", "-w", "@pillcount/web"]
