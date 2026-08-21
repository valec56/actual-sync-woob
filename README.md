# actual-sync-woob

Docker image that automatically fetches bank transactions via [Woob](https://woob.tech/), either as an OFX file dropped into a local directory (v1) or pushed straight into [Actual Budget](https://actualbudget.org/) via its API (v2). Multiple accounts are supported.

## Requirements

- Docker + Docker Compose
- Woob configured once locally (see [Woob configuration](#woob-configuration))
- For v2 only: a running [Actual Budget](https://actualbudget.org/) server reachable from the container

## Quick start

```bash
# 1. Clone the repo
git clone https://github.com/valec56/actual-sync-woob.git
cd actual-sync-woob

# 2. Run the interactive setup (configures Woob + creates config.json)
./scripts/setup.sh

# 3. Create the data folders and start the container
mkdir -p woob-config woob-cache bank-data
docker compose up -d --build
```

## Configuration

### config.json (recommended)

`./scripts/setup.sh` creates `config.json` interactively. You can also copy `config.json.example` and edit it manually.

**Multi-account example:**

```json
{
  "sync_mode": "v2",
  "cron_schedule": "0 5 * * *",
  "actual_server_url": "http://actual:5006",
  "actual_password": "your-password",
  "woob_history_count": 200,
  "accounts": [
    {
      "name": "Main Account",
      "woob_account_id": "<woob-id>",
      "actual_budget_id": "<sync-id>",
      "actual_account_id": "<account-id>",
      "enabled": true
    },
    {
      "name": "Secondary Account",
      "woob_account_id": "<woob-id>",
      "actual_budget_id": "<sync-id>",
      "actual_account_id": "<account-id>",
      "enabled": true
    }
  ]
}
```

Each account is synced independently. Set `"enabled": false` to pause a specific account without removing it.

### Environment variables (legacy, single account)

For backwards compatibility, a single account can still be configured via environment variables. Copy `.env.example` to `.env` and fill it in. `config.json` takes precedence when both are present.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SYNC_MODE` | No | `v1` | Sync path: `v1` (OFX file) or `v2` (Actual Budget API) |
| `WOOB_ACCOUNT_ID` | Yes | — | Account identifier as returned by `woob bank accounts` |
| `WOOB_HISTORY_COUNT` | No | `200` | Number of transactions to fetch |
| `OUTPUT_FILENAME` | v1 | `bank_export.ofx` | Name of the generated OFX file |
| `CRON_SCHEDULE` | No | `0 5 * * *` | Cron expression for the trigger |
| `ACTUAL_SERVER_URL` | v2 | — | URL of your Actual Budget server |
| `ACTUAL_PASSWORD` | v2 | — | Password used to log into the Actual server |
| `ACTUAL_BUDGET_ID` | v2 | — | Sync ID (Actual → Settings → Advanced → Sync ID) |
| `ACTUAL_ACCOUNT_ID` | v2 | — | Account ID inside the budget receiving the transactions |
| `ACTUAL_ENCRYPTION_PASSWORD` | No | — | E2E encryption password (only if the budget is encrypted) |

> Because cron does not inherit the container's environment, **any change to these variables requires a container restart** (`docker compose up -d`).

## Woob configuration

Woob must be configured **once** outside the container; the config is then mounted as a volume.

```bash
# Install Woob locally
pip install woob

# Configure the connector for your bank (interactive)
woob config add bank

# List accounts to find the woob_account_id values
woob bank accounts

# Copy the generated config into the project folder
cp -r ~/.config/woob/* ./woob-config/
```

## Logs and manual trigger

```bash
# Follow container logs
docker compose logs -f

# Follow cron logs inside the container
docker exec actual_sync tail -f /var/log/cron.log

# Trigger a sync manually (bypasses cron)
docker exec actual_sync node /app/sync.js   # v2
docker exec actual_sync bash /app/download.sh  # v1
```

## Troubleshooting

### Woob authentication fails

Possible causes: the bank interface changed (Woob needs updating) or 2FA is required. Re-run setup:

```bash
rm config.json
./scripts/setup.sh
```

### Sync runs but produces an empty file

Woob can exit 0 while producing an empty OFX file on auth or 2FA failures. Check the cron log for the error detail, then re-authenticate via `./scripts/setup.sh`.

### Container can't reach Actual Budget

If Actual Budget runs in a separate Compose stack, attach both containers to the same Docker network and use the service name as the hostname in `actual_server_url`.

## Project structure

```
.
├── Dockerfile              # Python + Woob + Node 24 + cron image
├── entrypoint.sh           # Generates the crontab, picks v1/v2
├── download.sh             # v1 — writes the OFX file to /data
├── sync.js                 # v2 — pushes transactions to Actual Budget
├── package.json            # Node dependencies (@actual-app/api)
├── config.json.example     # Configuration template
├── docker-compose.yml      # Orchestration + volumes
└── scripts/
    ├── setup.sh            # Interactive setup wizard
    └── validate-config.js  # config.json schema validator
```
