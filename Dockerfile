FROM node:20-slim AS build

WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/package.json frontend/pnpm-lock.yaml ./frontend/
RUN cd frontend && pnpm install --frozen-lockfile

COPY frontend/ ./frontend/
RUN cd frontend && pnpm run build

FROM node:20-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=build /app/frontend/dist ./dist
COPY server.ts ./

RUN npm install -g tsx

EXPOSE 7860

CMD ["tsx", "server.ts"]
