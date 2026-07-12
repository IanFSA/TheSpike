#!/bin/zsh

set -u

PROJECT_DIR="/Users/ianfraser/Documents/GitHub/TheSpike"
PID_FILE="/tmp/thespike-local-preview.pid"
PREVIEW_URL="http://localhost:3000/traffic"

cd "$PROJECT_DIR" || {
  echo "Could not open $PROJECT_DIR"
  read -k 1 "?Press any key to close..."
  exit 1
}

clear
echo "TheSpike local mock preview"
echo "==========================="
echo "Production services are disabled for this preview."
echo

# Explicit empty exports take precedence over any values in local dotenv files.
export THESPIKE_MOCK_PREVIEW="1"
export NEXT_PUBLIC_SUPABASE_URL=""
export NEXT_PUBLIC_SUPABASE_ANON_KEY=""
export SUPABASE_SERVICE_ROLE_KEY=""
export TRAFFICSA_USERNAME=""
export TRAFFICSA_PASSWORD=""
export TRAFFICSA_URL=""
export OPENAI_API_KEY=""
export OPENAI_MODEL=""
export CRON_SECRET=""
export VERCEL=""
export VERCEL_ENV=""
export NEXT_PUBLIC_SITE_URL="http://localhost:3000"

if [[ ! -x "node_modules/.bin/next" || "package-lock.json" -nt "node_modules/.package-lock.json" || "package.json" -nt "node_modules/.package-lock.json" ]]; then
  echo "Installing required dependencies..."
  npm install || {
    echo
    echo "Dependency installation failed."
    read -k 1 "?Press any key to close..."
    exit 1
  }
fi

if [[ -f "$PID_FILE" ]] && kill -0 "$(<"$PID_FILE")" 2>/dev/null; then
  echo "TheSpike preview is already running."
  open -a "Google Chrome" "$PREVIEW_URL"
  echo "Use Stop TheSpike Preview.command to stop it."
  read -k 1 "?Press any key to close this window..."
  exit 0
fi

rm -f "$PID_FILE"
echo "Starting the local development server..."
npm run dev -- --hostname 127.0.0.1 &
DEV_PID=$!
echo "$DEV_PID" > "$PID_FILE"

cleanup() {
  rm -f "$PID_FILE"
  if kill -0 "$DEV_PID" 2>/dev/null; then
    kill "$DEV_PID" 2>/dev/null
  fi
}
trap cleanup EXIT INT TERM HUP

echo "Waiting for http://localhost:3000..."
READY=0
for attempt in {1..90}; do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    break
  fi
  if /usr/bin/curl --silent --fail --max-time 1 "http://localhost:3000/traffic" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 1
done

if [[ "$READY" -ne 1 ]]; then
  echo
  echo "The local server did not become ready. Review the output above."
  read -k 1 "?Press any key to close..."
  exit 1
fi

echo
echo "Preview ready: $PREVIEW_URL"
echo "Close this Terminal window or run Stop TheSpike Preview.command to stop it."
open -a "Google Chrome" "$PREVIEW_URL"

# Keep this Terminal session and the development server alive together.
wait "$DEV_PID"

