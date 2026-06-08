#!/bin/bash
set -e

# Export all env vars so cron jobs can access them
printenv > /etc/environment

# Generate the crontab from the CRON_SCHEDULE variable
CRON_SCHEDULE="${CRON_SCHEDULE:-0 5 * * *}"
echo "${CRON_SCHEDULE} /bin/bash /app/download.sh >> /var/log/cron.log 2>&1" > /etc/cron.d/actual-sync
echo "" >> /etc/cron.d/actual-sync  # trailing newline required by cron
chmod 0644 /etc/cron.d/actual-sync
crontab /etc/cron.d/actual-sync

echo "Cron configured with schedule: ${CRON_SCHEDULE}"
echo "Current time: $(date)"

exec cron -f
