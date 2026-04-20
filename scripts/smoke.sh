#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3000}"
BASE_URL="http://localhost:${PORT}"
LOG_FILE="${SMOKE_LOG_FILE:-/tmp/thronekeeper-smoke.log}"
SERVER_PID=""
UPSTREAM_PID=""

health_status() {
  local status
  status="$(curl -sS --connect-timeout 1 -o /dev/null -w '%{http_code}' "${BASE_URL}/health" 2>/dev/null || true)"
  printf '%s' "${status:-000}"
}

cleanup() {
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill "${SERVER_PID}" 2>/dev/null || true
  fi
  if [ -n "${UPSTREAM_PID}" ] && kill -0 "${UPSTREAM_PID}" 2>/dev/null; then
    kill "${UPSTREAM_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

find_free_port() {
  node - <<'JS'
import net from 'node:net'
const server = net.createServer()
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  server.close(() => console.log(port))
})
JS
}

start_mock_upstream() {
  local upstream_port
  upstream_port="$(find_free_port)"
  node - "${upstream_port}" >/dev/null 2>&1 <<'JS' &
import http from 'node:http'

const port = Number(process.argv[2])
const response = JSON.stringify({
  id: 'chatcmpl-smoke',
  object: 'chat.completion',
  choices: [{
    index: 0,
    message: { role: 'assistant', content: 'Smoke test response.' },
    finish_reason: 'stop'
  }],
  usage: { prompt_tokens: 1, completion_tokens: 3, total_tokens: 4 }
})

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    req.resume()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(response)
    return
  }
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'not found' }))
}).listen(port, '127.0.0.1')
JS
  UPSTREAM_PID="$!"
  printf 'http://127.0.0.1:%s' "${upstream_port}"
}

wait_for_server() {
  for _ in $(seq 1 30); do
    if [ "$(health_status)" = "200" ]; then
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

initial_health_status="$(health_status)"
if [ "${initial_health_status}" != "200" ]; then
  if [ "${initial_health_status}" != "000" ]; then
    echo "Proxy detected on ${BASE_URL}, but /health returned HTTP ${initial_health_status}." >&2
    exit 1
  fi

  echo "No proxy detected on ${BASE_URL}; starting local proxy..." >&2
  MOCK_BASE_URL="$(start_mock_upstream)"
  PORT="${PORT}" \
    ANTHROPIC_PROXY_BASE_URL="${MOCK_BASE_URL}" \
    CUSTOM_API_KEY="${CUSTOM_API_KEY:-smoke-test-key}" \
    CUSTOM_ENDPOINT_OVERRIDES="{\"${MOCK_BASE_URL}\":\"openai\"}" \
    node index.js >"${LOG_FILE}" 2>&1 &
  SERVER_PID="$!"
  wait_for_server
fi

curl -fsS "${BASE_URL}/v1/messages" \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"Say hi"}],"stream":false}' | jq .

printf '\nSmoke test completed.\n' >&2
