#!/bin/bash
set -e

# Load environment variables (required because cron does not inherit the container's env)
if [ -f /etc/environment ]; then
  source /etc/environment
fi

CONFIG_FILE="${CONFIG_FILE:-/app/config.json}"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: $CONFIG_FILE not found" >&2
  exit 1
fi

# Verify jq is available
if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required. Install with: apt-get install jq" >&2
  exit 1
fi

# Load configuration using jq
SYNC_MODE=$(jq -r '.sync_mode' "$CONFIG_FILE")
WOOB_HISTORY_COUNT=$(jq -r '.woob_history_count // 200' "$CONFIG_FILE")
OUTPUT_FILENAME=$(jq -r '.output_filename // "bank_export.ofx"' "$CONFIG_FILE")

# Count enabled accounts
ACCOUNT_COUNT=$(jq '[.accounts[] | select(.enabled == true)] | length' "$CONFIG_FILE")

if [ "$ACCOUNT_COUNT" -eq 0 ]; then
  echo "ERROR: No enabled accounts in $CONFIG_FILE" >&2
  exit 1
fi

echo "[V1] Processing $ACCOUNT_COUNT account(s)"

# Iterate over enabled accounts
jq -r '.accounts[] | select(.enabled == true) | @base64' "$CONFIG_FILE" | while read account_b64; do
  # Decode account
  account_json=$(echo "$account_b64" | base64 -d)

  acc_name=$(echo "$account_json" | jq -r '.name')
  woob_id=$(echo "$account_json" | jq -r '.woob_account_id')

  echo "[V1] Exporting $acc_name ($woob_id)..."

  # Generate filename per account (use woob_id to avoid conflicts)
  output_file="/data/${woob_id}_${OUTPUT_FILENAME}"

  # Fetch and export
  woob config update
  woob bank history "$woob_id" -f ofx -n "$WOOB_HISTORY_COUNT" > "$output_file"

  # Validate file not empty
  if [ ! -s "$output_file" ]; then
    echo "[ERROR] Empty OFX file for $acc_name" >&2
    rm -f "$output_file"
    continue  # Continue with next account (don't exit)
  fi

  echo "[V1] ✓ Exported to $output_file"
done
