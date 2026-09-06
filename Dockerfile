FROM node:22-slim

ARG DUMPLING_VERSION=v8.5.7
ARG DUMPLING_SHA256=535cb9775849c4cf1c1d25b00c59342c41b006ca1a673a288da2118047d874c9

# Instalar Python3, pip, poppler-utils e dependências para weasyprint
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
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
    mariadb-client \
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Dumpling oficial para exportação lógica compatível com TiDB/MySQL.
RUN curl --proto '=https' --tlsv1.2 -fsSL \
      "https://tiup-mirrors.pingcap.com/dumpling-${DUMPLING_VERSION}-linux-amd64.tar.gz" \
      -o /tmp/dumpling.tar.gz \
    && printf '%s  %s\n' "${DUMPLING_SHA256}" /tmp/dumpling.tar.gz | sha256sum -c - \
    && tar -xzf /tmp/dumpling.tar.gz -C /usr/local/bin dumpling \
    && chmod 0755 /usr/local/bin/dumpling \
    && rm -f /tmp/dumpling.tar.gz

# Instalar weasyprint via pip (mesma forma que no sandbox)
RUN pip3 install weasyprint --break-system-packages

WORKDIR /app
COPY . .
RUN sed -i 's/\r$//' /app/scripts/render-start.sh && chmod +x /app/scripts/render-start.sh
RUN npm install -g pnpm@10.4.1 \
    && pnpm install --frozen-lockfile \
    && node scripts/patch-admin-login-data-reload.mjs \
    && pnpm run build

ENV NODE_ENV=production
ENV BACKUP_DUMPLING_BINARY=/usr/local/bin/dumpling
CMD ["/app/scripts/render-start.sh"]
