# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Docker image that periodically pulls bank transactions via [Woob](https://woob.tech/) and exports them as an OFX file to a mounted volume.

**Language convention: all logs, code comments, and documentation are written in English.** Conversations with the user may still happen in French — only the artifacts (files, commits, comments) are English.

## Configuration

The project supports two configuration methods:

1. **config.json (recommended)** — declarative, multi-account capable
   - Run `./scripts/setup.sh` to create interactively
   - Or copy `config.json.example` and edit manually

2. **Environment variables (legacy)** — single account, fallback
   - Set via `.env` or docker-compose.yml
   - SYNC_MODE, WOOB_ACCOUNT_ID, ACTUAL_* variables

Env vars are still supported for backwards compatibility, but config.json takes precedence.

### Syncing accounts

Run `./scripts/setup.sh` before first start to configure Woob and create config.json. The container will load config.json at startup and sync all enabled accounts.

## Two sync paths, picked by `SYNC_MODE`

The image ships both paths; `entrypoint.sh` reads `SYNC_MODE` at startup and points cron at the matching command:

- **v1 (default, `SYNC_MODE=v1`)** — pure shell. Cron runs `download.sh`, which calls `woob bank history ... -f ofx` and writes the file to `/data`. No Actual Budget instance required.
- **v2 (`SYNC_MODE=v2`)** — Node. Cron runs `node sync.js`, which performs the same Woob extraction and then pushes transactions into Actual Budget via `@actual-app/api`. Requires `ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, `ACTUAL_BUDGET_ID`, `ACTUAL_ACCOUNT_ID` (and optionally `ACTUAL_ENCRYPTION_PASSWORD`).

The Dockerfile installs both Python/Woob and Node 24 (via NodeSource) so either path works without rebuilding. When asked to "run the sync" or "fix the script", clarify which mode unless context makes it obvious.

## Cron + env vars: the non-obvious bit

Cron jobs in the container do **not** inherit the container's environment. The flow that makes env vars reach `download.sh`:

1. `entrypoint.sh` runs `printenv > /etc/environment` to snapshot all env vars at container start.
2. `download.sh` re-sources `/etc/environment` before doing anything.

Consequence: **env var changes require a container restart**, not just a re-run of the script. If you add a new env var consumed by `download.sh`, no extra plumbing is needed — `printenv` covers it — but document it in `.env.example`.

## Volumes and external state

`docker-compose.yml` mounts three host directories:

- `./woob-config` → `/root/.config/woob` — **must be populated on the host first** by running `woob config add bank` locally. The container does not have an interactive Woob setup path.
- `./woob-cache` → `/root/.local/share/woob` — Woob's runtime cache (modules, etc.).
- `./donnees-banque` → `/data` — output directory for the OFX file.

The `bank-data/` and `donnees-banque/` folders in the repo root are example/local output dirs — they're gitignored content-wise but the folders themselves may exist. Don't commit OFX files.

## Common commands

```bash
# Build + run (reads .env)
docker compose up -d --build

# Tail cron logs
docker compose logs -f
docker exec actual_sync tail -f /var/log/cron.log

# Trigger a sync manually (bypasses cron)
docker exec actual_sync /bin/bash /app/download.sh

# Inspect the generated crontab inside the container
docker exec actual_sync crontab -l
```

There is no test suite, no linter, and no build step beyond `docker build`.

## When editing `download.sh`, `entrypoint.sh`, or `sync.js`

- They're copied into the image via the Dockerfile, so changes require a rebuild (`docker compose up -d --build`), not just a restart.
- Both shell scripts use `set -e` semantics implicitly via the `${VAR:?...}` pattern for required vars — preserve that style for new required inputs.
- `sync.js` mirrors the same contract with a `requireEnv()` helper that throws before any work happens; new required vars should be added there.
- The empty-file check at the end of `download.sh` (`[ -s "${OUTPUT_PATH}" ]`) is intentional and is also enforced in `sync.js` against `/tmp/export.ofx`: Woob can exit 0 while producing an empty file on auth/2FA failures.
- `sync.js` exits non-zero on failure (via `run().catch(...)`) so cron logs surface the error — don't swallow exceptions silently.
