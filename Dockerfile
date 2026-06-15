FROM node:20-slim

WORKDIR /app

RUN npx skills add byreal-git/byreal-agent-skills || echo "Byreal CLI not available, continuing"

COPY package*.json ./
RUN npm install --omit=dev

COPY dist/ ./dist/
COPY src/views/ ./dist/views/

EXPOSE 3000
CMD ["node", "dist/index.js"]
