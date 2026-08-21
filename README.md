# actual-sync-woob

Docker image that automatically fetches bank transactions via [Woob](https://woob.tech/), either as an OFX file dropped into a local directory (v1) or pushed straight into [Actual Budget](https://actualbudget.org/) via its API (v2). The mode is picked at startup with the `SYNC_MODE` environment variable.

## Requirements

- Docker + Docker Compose
- Woob configured once locally (see [Woob configuration](#woob-configuration))
- For `SYNC_MODE=v2` only: a running [Actual Budget](https://actualbudget.org/) server you can reach from the container

## Quick start

```bash
# 1. Copy and fill in the configuration file
cp .env.example .env

# 2. Place the Woob config in the dedicated folder (see next section)
mkdir -p woob-config woob-cache bank-data

# 3. Start the container
docker compose up -d
```

The behaviour depends on `SYNC_MODE` (see below).

## Configuration

### Option 1: Interactive Setup (Recommended)
```bash
./scripts/setup.sh
```

### Option 2: Manual Configuration
1. Copy `config.json.example` to `config.json`
2. Edit with your Woob account IDs and Actual Budget credentials
3. Run `docker-compose up -d --build`

### Multi-Account Support

`config.json` supports multiple accounts. Each is synced independently:

```json
{
  "accounts": [
    { "name": "Account 1", "woob_account_id": "...", ... },
    { "name": "Account 2", "woob_account_id": "...", ... }
  ]
}
```

### v1 — OFX file (default)

Keep `SYNC_MODE=v1` and set `WOOB_ACCOUNT_ID` (plus optionally `OUTPUT_FILENAME`). The OFX file is dropped into `./bank-data/` according to the configured schedule. No Actual Budget instance is required.

### v2 — push to Actual Budget

Set `SYNC_MODE=v2` and fill in the `ACTUAL_*` variables in addition to `WOOB_ACCOUNT_ID`:

```dotenv
SYNC_MODE=v2
WOOB_ACCOUNT_ID=<your-woob-account-id>
ACTUAL_SERVER_URL=http://actual:5006
ACTUAL_PASSWORD=<your-actual-password>
ACTUAL_BUDGET_ID=<sync-id>          # Actual → Settings → Advanced → Sync ID
ACTUAL_ACCOUNT_ID=<target-account>  # account inside the budget receiving the transactions
# ACTUAL_ENCRYPTION_PASSWORD=       # only if the budget is end-to-end encrypted
```

In this mode no OFX file is written to `./bank-data/`: transactions are imported directly into the configured Actual account on each run. The container must be able to reach `ACTUAL_SERVER_URL` — if Actual runs in another Compose stack, attach both to the same Docker network.

Because cron does not inherit the container's environment, **any change to these variables requires a container restart** (`docker compose up -d`), not just waiting for the next scheduled run.

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
