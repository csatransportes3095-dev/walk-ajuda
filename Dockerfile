FROM node:22-slim

# Instalar Python3, pip, poppler-utils e dependências para weasyprint
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-cffi \
    poppler-utils \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    fonts-liberation \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Instalar weasyprint via pip (mesma forma que no sandbox)
RUN pip3 install weasyprint --break-system-packages

WORKDIR /app
COPY . .
RUN sed -i 's/\r$//' /app/scripts/render-start.sh && chmod +x /app/scripts/render-start.sh
RUN npm install -g pnpm@10.4.1 && pnpm install --frozen-lockfile && pnpm run build

ENV NODE_ENV=production
CMD ["/app/scripts/render-start.sh"]
