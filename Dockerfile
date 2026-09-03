FROM node:20-alpine
WORKDIR /app
COPY package.json local.js ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
