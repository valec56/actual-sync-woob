# actual-sync-woob

Docker image that automatically fetches bank transactions via [Woob](https://woob.tech/) and exports them as an OFX file into a local directory.

> **v2 (upcoming):** direct import into [Actual Budget](https://actualbudget.org/) via its API.

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
| `WOOB_ACCOUNT_ID` | Yes | — | Account identifier as returned by `woob bank accounts` |
| `WOOB_HISTORY_COUNT` | No | `200` | Number of transactions to fetch |
| `OUTPUT_FILENAME` | No | `bank_export.ofx` | Name of the generated OFX file |
| `CRON_SCHEDULE` | No | `0 5 * * *` | Cron expression for the trigger (every day at 5am by default) |

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
├── Dockerfile          # Python + Woob + cron image
├── entrypoint.sh       # Configures the crontab from env vars at startup
├── download.sh         # Script run by cron: calls Woob and exports the OFX
├── docker-compose.yml  # Orchestration + volumes
├── .env.example        # Configuration template
├── sync.js             # (v2) Direct import into Actual Budget via the API
└── package.json        # (v2) Node.js dependencies
```
