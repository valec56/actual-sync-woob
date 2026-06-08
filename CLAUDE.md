# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Docker image that periodically pulls bank transactions via [Woob](https://woob.tech/) and exports them as an OFX file to a mounted volume.

**Language convention: all logs, code comments, and documentation are written in English.** Conversations with the user may still happen in French — only the artifacts (files, commits, comments) are English.

## Two versions live in this repo

The codebase contains two distinct sync paths. Be careful which one you touch:

- **v1 (shipped, the one the Docker image runs)** — pure shell. `entrypoint.sh` writes a crontab from `CRON_SCHEDULE`, cron then runs `download.sh` which calls `woob bank history ... -f ofx` and writes the file to `/data`. No Node.js involved at runtime.
- **v2 (WIP, not wired into the container)** — `sync.js` + `package.json`. Same Woob extraction, but pushes transactions directly into Actual Budget via `@actual-app/api`. The Dockerfile does **not** install Node or copy `sync.js`, and the `ACTUAL_*` env vars in `.env.example` are commented out. Treat `sync.js` as a draft until the Dockerfile/entrypoint are updated.

When asked to "run the sync" or "fix the script", clarify which path unless context makes it obvious.

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

## When editing `download.sh` or `entrypoint.sh`

- They're copied into the image via the Dockerfile, so changes require a rebuild (`docker compose up -d --build`), not just a restart.
- Both use `set -e` semantics implicitly via the `${VAR:?...}` pattern for required vars — preserve that style for new required inputs.
- The empty-file check at the end of `download.sh` (`[ -s "${OUTPUT_PATH}" ]`) is intentional: Woob can exit 0 while producing an empty file on auth/2FA failures.
