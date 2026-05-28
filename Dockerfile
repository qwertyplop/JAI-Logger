FROM node:20-slim AS build

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy files
COPY package.json .
COPY frontend/package.json ./frontend/
COPY frontend/pnpm-lock.yaml ./frontend/pnpm-lock.yaml

# Install dependencies
RUN pnpm install

# Copy frontend src and build it
COPY frontend/ ./frontend/
RUN cd frontend && pnpm run build

# Final stage
FROM node:20-slim

WORKDIR /app

# Copy package.json and install prod deps
COPY package.json .
RUN npm install --production

# Copy the built frontend
COPY --from=build /app/frontend/dist ./dist

# Copy server code
COPY server.ts .

# Install tsx globally to run the server
RUN npm install -g tsx

EXPOSE 7860

CMD ["tsx", "server.ts"]
