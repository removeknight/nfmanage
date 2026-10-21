#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [[ "${EUID}" -ne 0 ]]; then
  echo "请使用 sudo bash deploy/install.sh 运行。" >&2
  exit 1
fi

# Optional lab proxy. The app processes themselves remain host processes.
if [[ -f /root/proxy ]]; then
  # shellcheck disable=SC1091
  source /root/proxy
  export HTTP_PROXY="${HTTP_PROXY:-${http_proxy:-}}" HTTPS_PROXY="${HTTPS_PROXY:-${https_proxy:-}}"
  export http_proxy="${http_proxy:-${HTTP_PROXY:-}}" https_proxy="${https_proxy:-${HTTPS_PROXY:-}}"
fi

install_package() {
  local package="$1"
  if command -v dnf >/dev/null 2>&1; then dnf install -y "$package"
  elif command -v yum >/dev/null 2>&1; then yum install -y "$package"
  elif command -v apt-get >/dev/null 2>&1; then apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y "$package"
  else echo "不支持的 Linux 包管理器，请手动安装：$package" >&2; exit 1
  fi
}

for command_name in curl tar xz; do
  command -v "$command_name" >/dev/null 2>&1 || install_package "$command_name"
done
command -v openssl >/dev/null 2>&1 || install_package openssl

if ! command -v docker >/dev/null 2>&1; then
  echo "安装 Docker Engine（仅用于 PostgreSQL 组件）..."
  install_script="$(mktemp)"
  trap 'rm -f "$install_script"' EXIT
  curl -fsSL https://get.docker.com -o "$install_script"
  sh "$install_script"
fi
docker compose version >/dev/null 2>&1 || { echo "请安装 Docker Compose 插件后重试。" >&2; exit 1; }
systemctl enable --now docker

if ! command -v nginx >/dev/null 2>&1; then install_package nginx; fi
if ! command -v node >/dev/null 2>&1 || ! node --version | grep -q '^v22\.'; then
  if command -v dnf >/dev/null 2>&1 || command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
    install_package nodejs
  elif command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    install_package nodejs
  else echo "请手动安装 Node.js 22。" >&2; exit 1
  fi
fi

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh -o /tmp/watermanage-uv-install.sh
  env UV_INSTALL_DIR=/usr/local/bin UV_NO_MODIFY_PATH=1 sh /tmp/watermanage-uv-install.sh
  rm -f /tmp/watermanage-uv-install.sh
fi
uv python install 3.13

if [[ ! -f .env ]]; then
  password="$(openssl rand -hex 32)"
  install -m 600 /dev/null .env
  cat > .env <<EOF
POSTGRES_DB=watermanage
POSTGRES_USER=watermanage
POSTGRES_PASSWORD=${password}
APP_PORT=8080
CORS_ORIGINS=*
DATABASE_URL=postgresql+psycopg://watermanage:${password}@127.0.0.1:5432/watermanage
WECHAT_APP_ID=
WECHAT_APP_SECRET=
MINI_AUTH_MODE=wechat
SEED_DEMO_DATA=false
FRONTEND_MODE=static
EOF
  chmod 600 .env
  echo "已生成 .env 和随机数据库密码（权限 0600）。请安全保管该文件。"
fi

if ! grep -q '^MINI_AUTH_MODE=' .env; then
  printf 'MINI_AUTH_MODE=wechat\n' >> .env
fi

if ! grep -q '^DATABASE_URL=' .env; then
  db_name="$(sed -n 's/^POSTGRES_DB=//p' .env | tail -n1)"
  db_user="$(sed -n 's/^POSTGRES_USER=//p' .env | tail -n1)"
  db_password="$(sed -n 's/^POSTGRES_PASSWORD=//p' .env | tail -n1)"
  printf 'DATABASE_URL=postgresql+psycopg://%s:%s@127.0.0.1:5432/%s\n' "${db_user:-watermanage}" "$db_password" "${db_name:-watermanage}" >> .env
fi
sed -i 's/@db:5432\//@127.0.0.1:5432\//' .env

set -a
# shellcheck disable=SC1091
source .env
set +a
export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://${POSTGRES_USER:-watermanage}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB:-watermanage}}"
export CORS_ORIGINS="${CORS_ORIGINS:-*}"
export WECHAT_APP_ID="${WECHAT_APP_ID:-}"
export WECHAT_APP_SECRET="${WECHAT_APP_SECRET:-}"
export MINI_AUTH_MODE="${MINI_AUTH_MODE:-wechat}"
export SEED_DEMO_DATA="${SEED_DEMO_DATA:-false}"
frontend_mode="${FRONTEND_MODE:-static}"
[[ "$frontend_mode" == static || "$frontend_mode" == preview ]] || { echo "FRONTEND_MODE 仅支持 static 或 preview。" >&2; exit 1; }
chmod 600 .env

# Remove only the old app containers created by this project version. Keep the
# PostgreSQL container and named volume so an upgrade retains all shop data.
docker rm -f watermanage-api-1 watermanage-web-1 >/dev/null 2>&1 || true
docker compose up -d db
for attempt in $(seq 1 60); do
  state="$(docker inspect -f '{{.State.Health.Status}}' watermanage-db-1 2>/dev/null || true)"
  [[ "$state" == healthy ]] && break
  sleep 2
done
[[ "${state:-}" == healthy ]] || { echo "PostgreSQL 启动失败，请检查 docker compose logs db。" >&2; exit 1; }

uv venv --python 3.13 --allow-existing .venv
uv pip install --python .venv/bin/python -r backend/requirements.txt
export UV_TOOL_DIR=/opt/supervisor UV_TOOL_BIN_DIR=/usr/local/bin
uv tool install --force --python 3.13 supervisor
npm --prefix frontend ci --no-audit --no-fund
npm --prefix frontend run build
(cd backend && ../.venv/bin/alembic upgrade head)

mkdir -p /etc/supervisor/conf.d /var/log/supervisor
cat > /etc/supervisord.conf <<'EOF'
[unix_http_server]
file=/run/supervisor.sock
chmod=0700

[inet_http_server]
port=127.0.0.1:9001

[supervisord]
logfile=/var/log/supervisor/supervisord.log
pidfile=/run/supervisord.pid
childlogdir=/var/log/supervisor
nodaemon=false

[rpcinterface:supervisor]
supervisor.rpcinterface_factory=supervisor.rpcinterface:make_main_rpcinterface

[supervisorctl]
serverurl=unix:///run/supervisor.sock

[include]
files=/etc/supervisor/conf.d/*.conf
EOF

npm_bin="$(command -v npm)"
install -m 600 /dev/null /etc/supervisor/conf.d/watermanage.conf
cat > /etc/supervisor/conf.d/watermanage.conf <<EOF
[program:watermanage-api]
command=${APP_DIR}/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
directory=${APP_DIR}/backend
environment=DATABASE_URL="${DATABASE_URL}",CORS_ORIGINS="${CORS_ORIGINS}",WECHAT_APP_ID="${WECHAT_APP_ID}",WECHAT_APP_SECRET="${WECHAT_APP_SECRET}",MINI_AUTH_MODE="${MINI_AUTH_MODE}",SEED_DEMO_DATA="${SEED_DEMO_DATA}"
autostart=true
autorestart=true
startsecs=5
stopasgroup=true
killasgroup=true
stdout_logfile=/var/log/supervisor/watermanage-api.log
stderr_logfile=/var/log/supervisor/watermanage-api-error.log
EOF
if [[ "$frontend_mode" == preview ]]; then
cat >> /etc/supervisor/conf.d/watermanage.conf <<EOF
[program:watermanage-frontend]
command=${npm_bin} --prefix ${APP_DIR}/frontend run preview
directory=${APP_DIR}/frontend
autostart=true
autorestart=true
startsecs=5
stopasgroup=true
killasgroup=true
stdout_logfile=/var/log/supervisor/watermanage-frontend.log
stderr_logfile=/var/log/supervisor/watermanage-frontend-error.log
EOF
fi
chmod 600 /etc/supervisor/conf.d/watermanage.conf

cat > /etc/systemd/system/supervisord.service <<EOF
[Unit]
Description=Supervisor process control system
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=forking
ExecStart=/usr/local/bin/supervisord -c /etc/supervisord.conf
ExecStop=/usr/local/bin/supervisorctl -c /etc/supervisord.conf shutdown
ExecReload=/usr/local/bin/supervisorctl -c /etc/supervisord.conf reread
PIDFile=/run/supervisord.pid
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl disable --now watermanage-api.service >/dev/null 2>&1 || true
rm -f /etc/systemd/system/watermanage-api.service

app_port="${APP_PORT:-8080}"
if [[ "$frontend_mode" == static ]]; then
  frontend_location="root ${APP_DIR}/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;"
else
  frontend_location='proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'
fi
cat > /etc/nginx/conf.d/watermanage.conf <<EOF
server {
    listen ${app_port};
    server_name ${SERVER_NAME:-_};
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location ~ ^/(docs|openapi.json|redoc)(/|$) {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
    }

    location / {
        ${frontend_location}
    }
}
EOF

nginx -t
systemctl daemon-reload
systemctl enable supervisord
if systemctl is-active --quiet supervisord; then systemctl restart supervisord; else systemctl start supervisord; fi
supervisorctl -c /etc/supervisord.conf reread
supervisorctl -c /etc/supervisord.conf update
supervisorctl -c /etc/supervisord.conf restart watermanage-api
if [[ "$frontend_mode" == preview ]]; then supervisorctl -c /etc/supervisord.conf restart watermanage-frontend; fi
systemctl enable nginx
systemctl reload nginx || systemctl restart nginx

if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-port="${app_port}/tcp"
  firewall-cmd --reload
fi

for attempt in $(seq 1 30); do
  curl --noproxy '*' -fsS http://127.0.0.1:8000/api/health >/dev/null && break
  sleep 2
done
curl --noproxy '*' -fsS "http://127.0.0.1:${app_port}/" >/dev/null
echo "部署完成。前端模式：${frontend_mode}；FastAPI 由 Supervisor 管理；管理端口仅监听 127.0.0.1:9001；Nginx 负责入口；PostgreSQL 由 Docker Compose 管理。访问端口：${app_port}"
echo "首次开通商家：运行 bash deploy/merchant-bootstrap.sh 查看已绑定客户，再加 --customer-id 客户ID 指定首位店主。"
echo "电脑后台需要店主登录码：在小程序商家工作台生成，5 分钟内有效；登录后会话有效 8 小时。"
echo "MINI_AUTH_MODE=mock 仅供测试；切换正式微信登录后，请重新为真实微信账号初始化店主。"
