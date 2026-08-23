# actual-sync-woob

Docker image that automatically fetches bank transactions via [Woob](https://woob.tech/), either as an OFX file dropped into a local directory (v1) or pushed straight into [Actual Budget](https://actualbudget.org/) via its API (v2). Multiple accounts are supported.

## Quick start

### 1. Configure Woob (once, using the container)

Woob is included in the image. Run it interactively in a temporary container to generate the credentials, which are then persisted in a local folder and mounted on every subsequent start.

```bash
mkdir -p woob-config woob-cache bank-data

# Find your bank's module name (e.g. cragr, bnporc, lcl, fortuneo…)
docker run --rm \
  --entrypoint woob \
  -v ./woob-config:/root/.config/woob \
  -v ./woob-cache:/root/.local/share/woob \
  ghcr.io/valec56/actual-sync-woob:latest \
  bank list-modules

# Configure the connector for your bank (replace <module> with the name above)
# When prompted "How do you want to store it?", always answer s (store) so
# credentials are saved to woob-config/ and reused on every container start.
docker run --rm -it \
  --entrypoint woob \
  -v ./woob-config:/root/.config/woob \
  -v ./woob-cache:/root/.local/share/woob \
  ghcr.io/valec56/actual-sync-woob:latest \
  config add <module>

# List your accounts to find the IDs you'll need in config.json
docker run --rm \
  --entrypoint woob \
  -v ./woob-config:/root/.config/woob \
  -v ./woob-cache:/root/.local/share/woob \
  ghcr.io/valec56/actual-sync-woob:latest \
  bank accounts
```

### 3. Create a docker-compose.yml

```yaml
services:
  actual-sync:
    image: ghcr.io/valec56/actual-sync-woob:latest
    container_name: actual_sync
    restart: unless-stopped
    volumes:
      - ./woob-config:/root/.config/woob:Z
      - ./woob-cache:/root/.local/share/woob:Z
      - ./bank-data:/data:Z
      - ./config.json:/app/config.json:ro
```

### 4. Create config.json

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
      "woob_account_id": "<id from woob bank accounts>",
      "actual_budget_id": "<Actual → Settings → Advanced → Sync ID>",
      "actual_account_id": "<account id in the budget>",
      "enabled": true
    }
  ]
}
```

See `config.json.example` for all available fields.

### 5. Start

```bash
docker compose up -d
```

## Multi-account

Add more entries to the `accounts` array. Each is synced independently. Set `"enabled": false` to pause a specific account without removing it.

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

Possible causes: the bank interface changed (Woob needs updating) or 2FA is required. Re-run Woob setup using the container, then restart:

```bash
docker run --rm -it \
  --entrypoint woob \
  -v ./woob-config:/root/.config/woob \
  -v ./woob-cache:/root/.local/share/woob \
  ghcr.io/valec56/actual-sync-woob:latest \
  config add <module>

docker compose restart
```

### Sync runs but produces an empty file

Woob can exit 0 while producing an empty OFX file on auth or 2FA failures. Check the cron log for the error detail, then re-authenticate as above.

### Container can't reach Actual Budget

If Actual Budget runs in a separate Compose stack, attach both containers to the same Docker network and use the service name as the hostname in `actual_server_url`.

## Environment variables (legacy, single account)

For backwards compatibility, a single account can still be configured via environment variables instead of `config.json`. `config.json` takes precedence when both are present.

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

## Contributing

```bash
git clone https://github.com/valec56/actual-sync-woob.git
cd actual-sync-woob
docker compose up -d --build
```

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
