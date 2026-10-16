#!/usr/bin/env bash
set -euo pipefail

for service in backend frontend; do
  pid_file=".qa/$service.pid"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then kill "$(cat "$pid_file")"; fi
  rm -f "$pid_file"
done
if [[ -f .env.qa.local ]]; then docker compose --project-name ecom-qa --env-file .env.qa.local stop postgres redis; fi
echo "QA services stopped; the ecom-qa PostgreSQL volume was preserved."
