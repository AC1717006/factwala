#!/usr/bin/env bash
# FactWala job runner for EC2 (called from cron).
# Usage: scripts/run-job.sh <news|rashifal|indiarank> [--test]
#
# - Runs from the repo folder, loads .env via dotenv (inside the bot).
# - flock prevents two runs of the same job overlapping.
# - Appends output to $LOG_DIR/<job>.log (default: <repo>/logs).
# - Deletes generated images older than 3 days from output/.
set -euo pipefail

JOB="${1:-}"
shift || true
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${LOG_DIR:-$APP_DIR/logs}"
LOCK_DIR="${LOCK_DIR:-/tmp}"

case "$JOB" in
  news)      ENTRY="index.js" ;;
  rashifal)  ENTRY="rashifal.js" ;;
  indiarank) ENTRY="indiarank.js" ;;
  *) echo "Usage: $0 <news|rashifal|indiarank> [--test]" >&2; exit 2 ;;
esac

mkdir -p "$LOG_DIR" "$APP_DIR/output"
cd "$APP_DIR"

# Clean old generated images (they are already on ImgBB/Instagram).
find "$APP_DIR/output" -type f -name '*.jpg' -mtime +3 -delete 2>/dev/null || true

{
  echo "===== $(date -Iseconds) START factwala-$JOB $* ====="
  if flock -n 9; then
    set +e
    node "$ENTRY" "$@"
    code=$?
    set -e
    echo "===== $(date -Iseconds) END factwala-$JOB exit=$code ====="
    exit $code
  else
    echo "Another factwala-$JOB run is still active — skipping."
    exit 0
  fi
} 9>"$LOCK_DIR/factwala-$JOB.lock" >>"$LOG_DIR/$JOB.log" 2>&1
