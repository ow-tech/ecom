#!/usr/bin/env bash
set -euo pipefail
if [[ ! -f .env.qa.local ]]; then echo "Missing .env.qa.local. Copy .env.qa.local.example first." >&2; exit 1; fi
set -a
. ./.env.qa.local
set +a
exec pnpm --filter @ecom/backend "$1"
