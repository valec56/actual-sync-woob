# Setup Guide

## Quick Start

1. **Clone and navigate:**
   ```bash
   git clone https://github.com/valec56/actual-sync-woob.git
   cd actual-sync-woob
   ```

2. **Run interactive setup:**
   ```bash
   ./scripts/setup.sh
   ```
   This will:
   - Configure Woob bank access (interactive)
   - Create `config.json` with your accounts and Actual Budget settings

3. **Start the service:**
   ```bash
   docker-compose up -d --build
   ```

4. **Check logs:**
   ```bash
   docker-compose logs -f
   ```

## Multi-Account Setup

To add more accounts after initial setup, edit `config.json`:

```json
{
  "accounts": [
    {
      "name": "Main Account",
      "woob_account_id": "account1",
      "actual_budget_id": "sync-id-1",
      "actual_account_id": "account-id-1",
      "enabled": true
    },
    {
      "name": "Secondary Account",
      "woob_account_id": "account2",
      "actual_budget_id": "sync-id-1",
      "actual_account_id": "account-id-2",
      "enabled": true
    }
  ]
}
```

Then restart:
```bash
docker-compose up -d --build
```

## Troubleshooting

### Woob authentication fails

If Woob fails to connect, it may be due to:
- Bank interface changed (Woob needs updating)
- 2FA/MFA enabled (configure during `./scripts/setup.sh`)

Re-run setup:
```bash
rm config.json
./scripts/setup.sh
```

### Manual trigger

To manually trigger a sync without waiting for cron:

**Mode v2:**
```bash
docker-compose exec actual-sync node /app/sync.js
```

**Mode v1:**
```bash
docker-compose exec actual-sync bash /app/download.sh
```
