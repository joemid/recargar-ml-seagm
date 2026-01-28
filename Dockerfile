# Dockerfile para RECARGAR-ML-SEAGM - USA CHROMIUM DE PUPPETEER (igual que local)
FROM node:18-slim

# Dependencias para Chromium
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libxss1 \
    libxtst6 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# NO skip Chromium - dejar que Puppeteer descargue su Chromium
RUN npm install

COPY . .

ENV NODE_ENV=production

EXPOSE 3003

CMD ["npm", "start"]
