FROM node:20-bookworm-slim
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
