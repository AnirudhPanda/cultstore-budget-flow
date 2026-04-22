FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY index.html styles.css app.js server.js run-app.sh ./
COPY data ./data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data

RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
