#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
mkdir -p backups
chmod 700 backups
timestamp="$(date +%Y%m%d-%H%M%S)"
target="${1:-backups/watermanage-${timestamp}.dump}"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$target"
chmod 600 "$target"
echo "备份完成：$target"
