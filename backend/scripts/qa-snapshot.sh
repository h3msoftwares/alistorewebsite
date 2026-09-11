#!/usr/bin/env bash
# Dumps the local dev database (via the running postgres container) to
# qa-snapshots/<UTC timestamp>_<label>.sql so a destructive test's DB state
# can be diffed before/after. Local dev only — always pulls from the
# ali-s-store-website-postgres-1 container's alistore db.
#
#   scripts/qa-snapshot.sh before-1.1
#   scripts/qa-snapshot.sh after-1.1
#   diff qa-snapshots/*_before-1.1.sql qa-snapshots/*_after-1.1.sql
set -euo pipefail

LABEL="${1:?usage: qa-snapshot.sh <label>}"
CONTAINER="ali-s-store-website-postgres-1"
OUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/qa-snapshots"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_FILE="$OUT_DIR/${STAMP}_${LABEL}.sql"

docker exec "$CONTAINER" pg_dump -U alistore --data-only --column-inserts alistore > "$OUT_FILE"
echo "[qa-snapshot] wrote $OUT_FILE"
