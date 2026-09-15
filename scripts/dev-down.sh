#!/usr/bin/env bash
# Development only (ENV-3): stop the API server started by scripts/dev-up.sh
# (or any `npm run dev` holding the port).
set -u

PORT="${PORT:-3000}"
PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null)"
# `tsx watch` restarts its child, so stop the watcher that owns it too.
for pid in $PIDS; do
  parent="$(ps -o ppid= -p "$pid" | tr -d ' ')"
  kill "$pid" ${parent:+"$parent"} 2>/dev/null
done
if [ -n "$PIDS" ]; then echo "Server on port $PORT stopped."; else echo "No server on port $PORT."; fi
