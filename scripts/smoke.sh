#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
BASE_URL="http://localhost:${PORT}"
LOG_FILE="${SMOKE_LOG_FILE:-/tmp/thronekeeper-smoke.log}"
SERVER_PID=""

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_for_server() {
  for _ in $(seq 1 30); do
    if curl -sS --connect-timeout 1 "${BASE_URL}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Proxy did not become ready. Last log output:" >&2
  if [ -f "${LOG_FILE}" ]; then
    tail -n 80 "${LOG_FILE}" >&2
  fi
  return 1
}

echo "Starting smoke test against ${BASE_URL}..." >&2

if ! curl -sS --connect-timeout 1 "${BASE_URL}/health" >/dev/null 2>&1; then
  echo "No proxy detected on ${BASE_URL}; starting local proxy..." >&2
  PORT="${PORT}" node index.js >"${LOG_FILE}" 2>&1 &
  SERVER_PID="$!"
  wait_for_server
fi

curl -s "${BASE_URL}/v1/messages" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Say hi"}],"stream":false}' | jq .

printf '\nSmoke test completed.\n' >&2
