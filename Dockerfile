FROM python:3.11-slim

# System packages:
#   cron                      → triggers the periodic sync
#   gnupg, curl, ca-certs     → required by the NodeSource installer
#   nodejs (via NodeSource)   → runs sync.js for the v2 path
#   woob                      → bank scraping (used by both v1 and v2)
RUN apt-get update && apt-get install -y --no-install-recommends \
        cron \
        gnupg \
        curl \
        ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir woob

WORKDIR /app
RUN mkdir /data

# Install Node deps in their own layer so source edits don't bust npm cache
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY download.sh entrypoint.sh sync.js ./
RUN chmod +x download.sh entrypoint.sh

RUN touch /var/log/cron.log

ENTRYPOINT ["/app/entrypoint.sh"]
