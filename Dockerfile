FROM node:20-slim

WORKDIR /app

RUN npm install -g @byreal-io/byreal-cli

COPY package*.json ./
RUN npm install --omit=dev

COPY dist/ ./dist/
COPY src/views/ ./dist/views/

EXPOSE 3000
CMD ["node", "dist/index.js"]
