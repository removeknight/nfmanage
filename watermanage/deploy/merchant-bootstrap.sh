#!/usr/bin/env bash
# Generate a first-owner code on the application server. No account is promoted here.
set -Eeuo pipefail
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"
if [[ ! -f .env || ! -x .venv/bin/python ]]; then
  echo "请先完成 deploy/install.sh 部署，再运行本工具。" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a
cd backend
../.venv/bin/python -m app.merchant_admin bootstrap
