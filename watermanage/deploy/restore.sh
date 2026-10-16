#!/usr/bin/env bash
set -Eeuo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
if [[ $# -ne 1 || ! -f "$1" ]]; then
  echo "用法：sudo bash deploy/restore.sh <数据库备份.dump>" >&2
  exit 2
fi
echo "即将覆盖当前数据库内容。"
read -r -p "输入 RESTORE 确认恢复：" confirmation
[[ "$confirmation" == "RESTORE" ]] || { echo "已取消。"; exit 1; }
docker compose exec -T db sh -c 'dropdb --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' < "$1"
supervisorctl -c /etc/supervisord.conf restart watermanage-api
echo "恢复完成。"
