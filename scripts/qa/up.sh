#!/usr/bin/env bash
set -euo pipefail

qa_launcher_running() {
  local pid_file="$1"
  local package_name="$2"
  local pid command
  [[ -s "$pid_file" ]] || return 1
  read -r pid < "$pid_file"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  command="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  [[ "$command" == *"pnpm --filter @ecom/$package_name dev"* || "$command" == *"pnpm --filter @ecom/$package_name exec next dev"* ]] || return 1
  pgrep -P "$pid" >/dev/null 2>&1
}

stop_stale_qa_launcher() {
  local pid_file="$1"
  local package_name="$2"
  local pid command
  [[ -s "$pid_file" ]] || return 0
  read -r pid < "$pid_file"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 0
  kill -0 "$pid" 2>/dev/null || return 0
  command="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  if [[ "$command" == *"pnpm --filter @ecom/$package_name dev"* ]]; then
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  fi
}

qa_backend_running() {
  qa_launcher_running .qa/backend.pid backend && curl --fail --silent --max-time 1 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null
}

qa_backend_healthy() {
  curl --fail --silent --max-time 1 "http://127.0.0.1:${BACKEND_PORT}/health" >/dev/null
}

qa_frontend_running() {
  qa_launcher_running .qa/frontend.pid frontend && curl --fail --silent --max-time 1 -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}/"
}

qa_env_file=".env.qa.local"
if [[ ! -f "$qa_env_file" ]]; then
  echo "Missing $qa_env_file. Copy .env.qa.local.example and provide QA_SEED_PASSWORD locally." >&2
  exit 1
fi
set -a
. "./$qa_env_file"
set +a
FRONTEND_PORT="${FRONTEND_PORT:-3100}"
if [[ "${QA_SEED_ENABLED:-}" != "true" || "${POSTGRES_DB:-}" != "ecom_local_qa" ]]; then
  echo "QA environment guard failed." >&2
  exit 1
fi
docker compose --project-name ecom-qa --env-file "$qa_env_file" up -d postgres redis
pnpm --filter @ecom/backend prisma:migrate:deploy
pnpm --filter @ecom/backend prisma:seed
pnpm --filter @ecom/backend qa:seed
mkdir -p .qa
if ! qa_backend_running && ! qa_backend_healthy; then
  stop_stale_qa_launcher .qa/backend.pid backend
  nohup pnpm --filter @ecom/backend dev >.qa/backend.log 2>&1 & echo $! >.qa/backend.pid
elif ! qa_backend_running; then
  echo "QA backend port ${BACKEND_PORT} is occupied by a process not owned by this QA launcher; refusing to reuse an unverified environment." >&2
  exit 1
fi
if ! qa_frontend_running; then
  stop_stale_qa_launcher .qa/frontend.pid frontend
  nohup pnpm --filter @ecom/frontend exec next dev --port "$FRONTEND_PORT" >.qa/frontend.log 2>&1 & echo $! >.qa/frontend.pid
fi
for attempt in $(seq 1 30); do
  if qa_backend_healthy && qa_frontend_running; then
    echo "QA services ready. Frontend: http://127.0.0.1:${FRONTEND_PORT}; backend: http://127.0.0.1:${BACKEND_PORT}; logs: .qa/backend.log and .qa/frontend.log"
    exit 0
  fi
  sleep 1
done
echo "QA services did not become healthy. Backend log:" >&2
tail -80 .qa/backend.log >&2 || true
echo "Frontend log:" >&2
tail -80 .qa/frontend.log >&2 || true
exit 1
