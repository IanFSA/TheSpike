#!/bin/zsh

set -u

PID_FILE="/tmp/thespike-local-preview.pid"

clear
echo "Stopping TheSpike local preview..."

if [[ ! -f "$PID_FILE" ]]; then
  echo "No running TheSpike preview was found."
  read -k 1 "?Press any key to close..."
  exit 0
fi

DEV_PID="$(<"$PID_FILE")"

if kill -0 "$DEV_PID" 2>/dev/null; then
  # Stop direct children first, then the npm process recorded by the launcher.
  /usr/bin/pkill -TERM -P "$DEV_PID" 2>/dev/null || true
  kill -TERM "$DEV_PID" 2>/dev/null || true

  for attempt in {1..20}; do
    if ! kill -0 "$DEV_PID" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done

  if kill -0 "$DEV_PID" 2>/dev/null; then
    /usr/bin/pkill -KILL -P "$DEV_PID" 2>/dev/null || true
    kill -KILL "$DEV_PID" 2>/dev/null || true
  fi

  echo "TheSpike preview stopped."
else
  echo "The recorded preview process is no longer running."
fi

rm -f "$PID_FILE"
read -k 1 "?Press any key to close..."

