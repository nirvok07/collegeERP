#!/usr/bin/env bash
# Development only (ENV-3): make sure the API server is answering, then point a
# USB phone at it. Safe to run any number of times: a running server is left alone.
# VS Code runs this when the project opens and before every app launch
# (.vscode/tasks.json, .vscode/launch.json). Stop it with scripts/dev-down.sh.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
LOG="$ROOT/server/dev-server.log"

healthy() { curl -fsS -m 2 "http://localhost:$PORT/health" >/dev/null 2>&1; }

if healthy; then
  echo "Server already running on port $PORT."
else
  echo "Starting the server on port $PORT..."
  # Detached, so it keeps running after this task's terminal closes.
  (cd "$ROOT/server" && PORT="$PORT" nohup npm run dev >"$LOG" 2>&1 &)
  for _ in $(seq 1 60); do
    healthy && break
    sleep 1
  done
  if ! healthy; then
    echo "The server did not start. Last lines of $LOG:"
    tail -20 "$LOG"
    exit 1
  fi
  echo "Server running on port $PORT (log: server/dev-server.log)."
fi

ADB="$(command -v adb || echo "$HOME/Library/Android/sdk/platform-tools/adb")"
if [ -x "$ADB" ] && "$ADB" get-state >/dev/null 2>&1; then
  "$ADB" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null && echo "Phone on USB can reach the server (adb reverse tcp:$PORT)."
else
  echo "No phone on USB; adb reverse skipped."
fi
