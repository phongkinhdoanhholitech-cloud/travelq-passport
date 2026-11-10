#!/usr/bin/env bash
set -u
ROOT="/workspace/travelq-passport/server"
PUBLIC="/workspace/travelq-passport/public"
LOG="$ROOT/watchdog.log"
ASKPASS="/tmp/askpass-empty.sh"
URLFILE="$ROOT/current-url.txt"
PUBFILE="$ROOT/public-url.txt"
cd "$ROOT"
mkdir -p "$ROOT"
[[ -x "$ASKPASS" ]] || { printf '#!/bin/bash\necho ""\n' > "$ASKPASS"; chmod +x "$ASKPASS"; }

log() { echo "[$(TZ=Asia/Saigon date '+%Y-%m-%d %H:%M:%S %Z')] $*" >> "$LOG"; }

ensure_server() {
  local pid
  pid=$(cat "$ROOT/server.pid" 2>/dev/null || true)
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    if curl -sf -m 2 http://127.0.0.1:8787/api/health >/dev/null; then
      return 0
    fi
  fi
  # also check port listener
  if curl -sf -m 2 http://127.0.0.1:8787/api/health >/dev/null; then
    return 0
  fi
  log "restarting server"
  pkill -f '/workspace/travelq-passport/server/index.js' 2>/dev/null || true
  pkill -f 'node index.js' 2>/dev/null || true
  sleep 0.5
  nohup node index.js >> "$ROOT/server.log" 2>&1 &
  echo $! > "$ROOT/server.pid"
  sleep 0.8
  curl -sf -m 3 http://127.0.0.1:8787/api/health >/dev/null && log "server ok pid=$(cat server.pid)" || log "server FAILED"
}

extract_urls() {
  python3 - <<'PY'
import re, pathlib
log = pathlib.Path('/workspace/travelq-passport/server/tunnel-pinggy.log').read_text(errors='ignore')
urls = re.findall(r'https://[a-z0-9.-]+(?:\.run\.pinggy-free\.link|\.free\.pinggy\.net)', log)
# take last pair (newest)
run = [u for u in urls if 'run.pinggy-free.link' in u]
free = [u for u in urls if 'free.pinggy.net' in u]
prim = run[-1] if run else ''
alt = free[-1] if free else ''
pathlib.Path('/workspace/travelq-passport/server/public-url.txt').write_text(f'{prim}\n{alt}\n')
pathlib.Path('/workspace/travelq-passport/server/current-url.txt').write_text(
  f'app={prim}/?id=017715&name=Dinh%20Dinh\nreader={prim}/reader.html\nalt={alt}\nupdated={__import__("datetime").datetime.now().astimezone().__str__()}\n'
)
print(prim)
PY
}

tunnel_alive() {
  local pid
  pid=$(cat "$ROOT/tunnel-pinggy.pid" 2>/dev/null || true)
  [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null || return 1
  # also try hit last known URL quickly
  local prim
  prim=$(head -1 "$PUBFILE" 2>/dev/null || true)
  if [[ -n "$prim" ]]; then
    if curl -sf -m 8 "$prim/api/health" >/dev/null 2>&1; then
      return 0
    fi
    # process up but tunnel dead externally — still restart
    return 1
  fi
  return 0
}

ensure_tunnel() {
  if tunnel_alive; then
    return 0
  fi
  log "restarting pinggy tunnel"
  pkill -f 'a.pinggy.io' 2>/dev/null || true
  sleep 0.4
  : > "$ROOT/tunnel-pinggy.log"
  export SSH_ASKPASS="$ASKPASS" SSH_ASKPASS_REQUIRE=force DISPLAY=:99
  nohup ssh -o StrictHostKeyChecking=accept-new -o ExitOnForwardFailure=yes \
    -o ServerAliveInterval=20 -o ServerAliveCountMax=3 \
    -p 443 -R0:127.0.0.1:8787 \
    -o ProxyCommand='openssl s_client -quiet -connect %h:%p -servername %h 2>/dev/null' \
    a.pinggy.io >> "$ROOT/tunnel-pinggy.log" 2>&1 &
  echo $! > "$ROOT/tunnel-pinggy.pid"
  for i in $(seq 1 15); do
    if grep -q 'pinggy' "$ROOT/tunnel-pinggy.log" 2>/dev/null; then
      break
    fi
    sleep 1
  done
  local prim
  prim=$(extract_urls)
  log "tunnel pid=$(cat tunnel-pinggy.pid) url=$prim"
  # verify external
  if [[ -n "$prim" ]] && curl -sf -m 15 "$prim/api/health" >/dev/null; then
    log "tunnel verified $prim"
  else
    log "tunnel verify FAILED $prim"
  fi
}

log "watchdog start"
while true; do
  ensure_server
  ensure_tunnel
  # refresh url file even if alive
  extract_urls >/dev/null
  sleep 45
done
