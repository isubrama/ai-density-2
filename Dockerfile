# Stage 1: Build Frontend
FROM node:20-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Build Backend
FROM node:20-slim AS backend-build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY backend/ ./backend/
COPY prompts.json ./
RUN npx tsc

# Stage 3: Production
FROM node:20-slim
WORKDIR /app
COPY --from=backend-build /app/package*.json ./
RUN npm install --omit=dev
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/prompts.json ./
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

EXPOSE 3000
CMD ["node", "dist/backend/index.js"]
