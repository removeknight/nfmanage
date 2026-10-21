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
if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  source .env
fi
upload_dir="${UPLOAD_DIR:-${APP_DIR}/uploads}"
if [[ -d "$upload_dir" ]]; then
  image_target="${target%.dump}.uploads.tar.gz"
  tar -czf "$image_target" -C "$upload_dir" .
  chmod 600 "$image_target"
  echo "图片备份完成：$image_target"
fi
