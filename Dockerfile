FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    cron \
    gnupg \
    && rm -rf /var/lib/apt/lists/* \
    && pip install --no-cache-dir woob

WORKDIR /app
RUN mkdir /data

COPY download.sh .
COPY entrypoint.sh .
RUN chmod +x download.sh entrypoint.sh

RUN touch /var/log/cron.log

ENTRYPOINT ["/app/entrypoint.sh"]
