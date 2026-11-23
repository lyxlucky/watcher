FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY db.ts delivery.ts http.ts index.ts monitoring.ts secrets.ts ./
ENV WORKER_HEALTH_PORT=8080
USER node
CMD ["node", "index.ts"]
