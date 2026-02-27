FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production --ignore-scripts
COPY . .
EXPOSE 8080
CMD ["node", "src/server.mjs"]
