# actual-sync-woob

Docker image that automatically fetches bank transactions via [Woob](https://woob.tech/), either as an OFX file dropped into a local directory (v1) or pushed straight into [Actual Budget](https://actualbudget.org/) via its API (v2). The mode is picked at startup with the `SYNC_MODE` environment variable.

## Requirements

- Docker + Docker Compose
- Woob configured once locally (see [Woob configuration](#woob-configuration))

## Quick start

```bash
# 1. Copy and fill in the configuration file
cp .env.example .env

# 2. Place the Woob config in the dedicated folder (see next section)
mkdir -p woob-config woob-cache bank-data

# 3. Start the container
docker compose up -d
```

The OFX file will be dropped into `./bank-data/` according to the configured schedule.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SYNC_MODE` | No | `v1` | Sync path: `v1` (OFX file) or `v2` (push to Actual Budget) |
| `WOOB_ACCOUNT_ID` | Yes | — | Account identifier as returned by `woob bank accounts` |
| `WOOB_HISTORY_COUNT` | No | `200` | Number of transactions to fetch |
| `OUTPUT_FILENAME` | v1 | `bank_export.ofx` | Name of the generated OFX file |
| `CRON_SCHEDULE` | No | `0 5 * * *` | Cron expression for the trigger (every day at 5am by default) |
| `ACTUAL_SERVER_URL` | v2 | — | URL of your Actual Budget server (e.g. `http://actual:5006`) |
| `ACTUAL_PASSWORD` | v2 | — | Password used to log into the Actual server |
| `ACTUAL_BUDGET_ID` | v2 | — | Sync ID of the budget (Actual → Settings → Advanced → Sync ID) |
| `ACTUAL_ACCOUNT_ID` | v2 | — | Account ID inside the budget that will receive the transactions |
| `ACTUAL_ENCRYPTION_PASSWORD` | No | — | End-to-end encryption password (only if the budget is encrypted) |

## Woob configuration

Woob must be configured **once** outside the container; the resulting config is then mounted as a volume.

```bash
# Install Woob locally
pip install woob

# Configure the connector for your bank
woob config add bank

# List accounts to find the WOOB_ACCOUNT_ID
woob bank accounts

# Copy the generated config into the project folder
cp -r ~/.config/woob/* ./woob-config/
```

## Logs

```bash
docker compose logs -f
# or directly inside the container:
docker exec actual_sync tail -f /var/log/cron.log
```

## Project structure

```
.
├── Dockerfile          # Python + Woob + Node 24 + cron image
├── entrypoint.sh       # Configures the crontab and picks v1/v2 from SYNC_MODE
├── download.sh         # v1 — called by cron in SYNC_MODE=v1, writes the OFX file
├── sync.js             # v2 — called by cron in SYNC_MODE=v2, pushes to Actual Budget
├── package.json        # v2 Node dependencies (@actual-app/api)
├── docker-compose.yml  # Orchestration + volumes
└── .env.example        # Configuration template
```
