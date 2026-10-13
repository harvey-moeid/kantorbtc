#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

mkdir -p test-results
# Isolate local D1 state so a test run cannot modify a developer's database.
test_state_root=$(mktemp -d)
export KANTOR_STATE_DIR="$test_state_root/v3"
export KANTOR_CI_DEMO=1
api_pid=""
web_pid=""
cleanup() {
  if [[ -n "$api_pid" ]]; then kill -- "-$api_pid" 2>/dev/null || true; fi
  if [[ -n "$web_pid" ]]; then kill -- "-$web_pid" 2>/dev/null || true; fi
  if [[ -n "$api_pid" ]]; then wait "$api_pid" 2>/dev/null || true; fi
  if [[ -n "$web_pid" ]]; then wait "$web_pid" 2>/dev/null || true; fi
  rm -rf -- "$test_state_root"
}
trap cleanup EXIT

# Refuse to test an unrelated server that already owns one of these ports.
python - <<'PY'
import socket
for port in (5173, 8787):
    with socket.socket() as sock:
        try:
            sock.bind(('0.0.0.0', port))
        except OSError:
            raise SystemExit(f'Port {port} is occupied; stop the local server before running CI smoke tests.')
PY

pnpm exec wrangler d1 migrations apply kantor-db --local --persist-to "$test_state_root"
setsid node scripts/dev-proxy.mjs >test-results/api.log 2>&1 &
api_pid=$!
setsid node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort >test-results/web.log 2>&1 &
web_pid=$!
python - <<'PY'
import json, time, urllib.request
for attempt in range(60):
    try:
        with urllib.request.urlopen('http://127.0.0.1:5173/api/health', timeout=1) as response:
            health = json.load(response)
        if health.get('status') == 'ok' and health.get('mode') == 'demo':
            break
        raise SystemExit(f"CI smoke tests require APP_MODE=demo; received status={health.get('status')!r}, mode={health.get('mode')!r}.")
    except (OSError, ValueError):
        time.sleep(0.5)
else:
    raise SystemExit('Development servers did not become ready; inspect test-results/api.log and web.log.')
PY

python tests/browser_smoke.py
python tests/meeting_smoke.py
python tests/alert_smoke.py
