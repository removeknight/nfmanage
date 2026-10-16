# 商店管理平台

此仓库按独立子项目组织。`watermanage/` 是水饮进销存应用；后续模块可作为同级目录接入，不与水饮业务代码混放。

## 项目结构

```text
watermanage/
├── backend/                 # FastAPI API 服务
│   └── app/
│       ├── routers/          # 按业务拆分 API 路由
│       ├── services/         # 库存和操作日志业务逻辑
│       ├── models.py         # SQLAlchemy 数据模型
│       ├── schemas.py        # API 请求结构
│       └── serializers.py    # 关联数据响应格式
├── frontend/                # React + Vite 单页应用
│   └── src/
│       ├── api/              # HTTP 客户端
│       ├── components/       # 可复用视图组件
│       ├── features/         # 按业务拆分的页面与表单
│       └── layout/           # 导航与应用框架
├── deploy/                   # Linux 安装、备份、恢复脚本
└── compose.yaml              # 仅编排 PostgreSQL 组件
```

## 水饮管理模块

- 商品库存：自定义品牌、品名、包装类型、容量、颜色、预警库存、进货均价和销售价。
- 成本核算：采购后以加权移动平均法重算库存成本；销售会减少库存数量。
- 销售利润：从当前版本起记录销售时的移动平均成本快照，逐单计算毛利；迁移前的历史销售没有成本快照，会标记为成本未记录。
- 客户管理：企业、小店、个人客户及配送地址。
- 销售配送：销售开单扣减库存并创建配送任务，可跟踪待配送、配送中和完成状态。
- 经营看板：今日销售额和出库量、待配送单、低库存商品、近七天库存和价格操作日志。
- 响应式前端：支持桌面、平板和窄屏手机浏览器。

当前版本为单店后台 MVP。用户登录、角色权限、多门店、订单退货、供应商管理、跨设备扫码等需在对应业务确定后扩展；操作人暂由单据手工填写。当前版本适合内网试用，正式公网使用前需补充账号权限和 HTTPS。请勿将默认演示数据当作真实经营记录。

## 服务管理方式

- PostgreSQL 由 Docker Compose 管理，数据持久化到 named volume `watermanage_postgres_data`，只绑定宿主机回环地址。
- FastAPI 使用 Python 3.13 虚拟环境运行，由 Supervisor 管理。
- React 前端构建后通过 Vite Preview 作为宿主机进程运行，也由 Supervisor 管理。
- Nginx 作为外部入口，将网页流量代理到前端进程，并将 `/api/`、`/docs` 请求代理到 FastAPI。
- Supervisor 本身由 systemd 设置为开机启动；项目程序由 Supervisor 配置自动启动和异常重启。

## 本机开发

复制 `watermanage/.env.example` 为 `watermanage/.env` 并设置强数据库密码，再启动 PostgreSQL：

```bash
cd watermanage
docker compose up -d db
```

本机开发需要 Python 3.13、Node.js 22、uv 和 Docker。复制 `.env.example` 为 `.env`，并将密码替换成随机强密码（同时更新 `DATABASE_URL` 中的密码）。然后在项目目录运行：

```bash
docker compose up -d db
uv venv --python 3.13 .venv
uv pip install --python .venv/bin/python -r backend/requirements.txt
set -a && source .env && set +a
(cd backend && ../.venv/bin/alembic upgrade head)
(cd backend && ../.venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000)
```

另开终端启动前端（打开 `http://127.0.0.1:5173`）：

```bash
cd watermanage/frontend
npm ci
npm run dev
```

Vite 会显示本地前端地址；首次启动后端会创建演示商品和客户，便于试用。

## Linux 部署与迁移

在目标 Linux 服务器将此仓库放到所需目录（建议 `/opt/nfmanage/watermanage`），然后执行：

```bash
cd watermanage
sudo bash deploy/install.sh
```

脚本检查并安装 Docker Engine / Compose 插件（若缺少），仅用 Compose 启动 PostgreSQL；安装 Python 3.13、Node.js 22 和系统级 Supervisor，构建前后端并写入 Supervisor 程序配置、Supervisor systemd 开机服务及 Nginx 入口配置。FastAPI 和前端都作为宿主机进程运行，不运行在 Docker 中。脚本会生成权限为 `0600` 的随机数据库密码。默认 HTTP 端口为 8080，可在 `.env` 设置 `APP_PORT` 修改。需在云安全组和服务器防火墙开放该端口。该部署入口不配置域名和 HTTPS；公网正式使用应在域名前配置 TLS 反向代理。

CentOS Linux 8 已停止维护，系统镜像源或 Docker 软件源可能无法访问。部署脚本会尝试官方安装脚本；若因旧系统软件源失败，应先升级到受支持的 Rocky Linux / AlmaLinux / RHEL 兼容发行版或准备可用的软件镜像，再重试。

### 系统级 Supervisor 进程管理

部署脚本使用 uv 将 Supervisor 安装为系统级命令：程序环境位于 `/opt/supervisor`，`supervisord` 和 `supervisorctl` 命令位于 `/usr/local/bin`，不依赖项目 `.venv`。脚本生成 `/etc/supervisord.conf`、`/etc/supervisor/conf.d/watermanage.conf` 和 `supervisord.service`。后端与前端分别以 `watermanage-api`、`watermanage-frontend` 两个程序运行，Supervisor 会设置自动启动和异常重启。

```bash
sudo systemctl status supervisord
sudo supervisorctl -c /etc/supervisord.conf status
sudo supervisorctl -c /etc/supervisord.conf restart watermanage-api
sudo supervisorctl -c /etc/supervisord.conf restart watermanage-frontend
sudo supervisorctl -c /etc/supervisord.conf tail -f watermanage-api
```

Supervisor 状态页绑定 `0.0.0.0:9001`，可从服务器外部通过 `http://服务器地址:9001` 访问。需在云安全组和系统防火墙放行 TCP 9001。状态页没有额外登录认证，开放端口会允许可达该端口的主机查看并控制 Supervisor 管理的进程；请仅在受信任网络开放，或通过网络 ACL 限制来源。

### 日常启动、更新和排查

```bash
# 启动数据库与应用
cd /opt/nfmanage/watermanage
sudo docker compose up -d db
sudo systemctl start supervisord nginx

# 更新源码后重新构建、执行数据库迁移并刷新 Supervisor 程序
sudo bash deploy/install.sh

# 查看应用、数据库和入口日志
sudo supervisorctl -c /etc/supervisord.conf status
sudo journalctl -u supervisord -n 100 --no-pager
sudo docker compose logs --tail=100 db
sudo tail -n 100 /var/log/nginx/error.log
```

备份与恢复：

```bash
sudo bash deploy/backup.sh
sudo bash deploy/restore.sh ./backups/watermanage-YYYYMMDD-HHMMSS.dump
```

迁移时先在旧服务器执行备份，把应用目录和 dump 文件复制到新服务器，在新机执行安装脚本后再执行恢复脚本。数据库持久数据位于 Docker named volume `watermanage_postgres_data`；不要只复制容器可写层。更完整的生产迁移可额外保存 `.env`（安全传输并限制权限）和数据库备份。

## 配置

复制 `.env.example` 到 `.env` 后可修改 `POSTGRES_PASSWORD`、`APP_PORT`、`CORS_ORIGINS`。安装脚本会生成数据库连接地址；如果手动修改数据库账号或密码，也要同步修改 `DATABASE_URL`。使用 `supervisorctl` 查看或重启前后端进程，`docker compose ps` 查看数据库容器，`systemctl status supervisord nginx` 查看进程管理器和入口服务。当前 MVP 没有登录、权限控制或 HTTPS，不应直接暴露到公网；生产环境需先配置 HTTPS、账号认证和备份策略。
