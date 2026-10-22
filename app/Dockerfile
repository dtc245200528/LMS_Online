# ---------- Stage 1: cài dependencies ----------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
# Dùng npm ci nếu đã có package-lock.json, ngược lại npm install
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi \
    && npm cache clean --force

# ---------- Stage 2: image chạy thật ----------
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

# Hardening: chạy bằng user "node" (UID 1000) có sẵn trong image, không dùng root
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node views ./views
COPY --chown=node:node public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "src/server.js"]
