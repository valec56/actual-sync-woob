#!/bin/bash
set -e

# Export all env vars so cron jobs can access them
printenv > /etc/environment

# Pick the sync command based on SYNC_MODE
#   v1 → download.sh writes an OFX file to /data
#   v2 → sync.js pushes transactions directly into Actual Budget
SYNC_MODE="${SYNC_MODE:-v1}"
case "${SYNC_MODE}" in
  v1) SYNC_CMD="/bin/bash /app/download.sh" ;;
  v2) SYNC_CMD="/usr/bin/node /app/sync.js" ;;
  *)
    echo "ERROR: invalid SYNC_MODE='${SYNC_MODE}' (expected 'v1' or 'v2')" >&2
    exit 1
    ;;
esac

# Generate the crontab from the CRON_SCHEDULE variable
CRON_SCHEDULE="${CRON_SCHEDULE:-0 5 * * *}"
echo "${CRON_SCHEDULE} ${SYNC_CMD} >> /var/log/cron.log 2>&1" > /etc/cron.d/actual-sync
echo "" >> /etc/cron.d/actual-sync  # trailing newline required by cron
chmod 0644 /etc/cron.d/actual-sync
crontab /etc/cron.d/actual-sync

echo "Cron configured with schedule: ${CRON_SCHEDULE} (mode: ${SYNC_MODE})"
echo "Current time: $(date)"

exec cron -f
