FROM node:20-bookworm-slim

WORKDIR /app

# Install server deps only
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev

# App code + static frontend
COPY server/ ./server/
COPY public/ ./public/

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

WORKDIR /app/server
CMD ["node", "index.js"]
