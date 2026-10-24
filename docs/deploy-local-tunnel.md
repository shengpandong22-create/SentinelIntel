# 本机免费演示部署（Cloudflare Quick Tunnel）

该方案用于短期面试演示：SentinelIntel 在已有电脑的 Docker Compose 中运行，只把 Web
端口通过随机的 `trycloudflare.com` 地址临时公开。它不适合生产环境，不承诺固定域名或
可用时间，也不能替代独立云服务器部署。

## 安全边界

- 只代理 Web 服务；PostgreSQL、API 和 Python Agent Runtime 不映射到公网。
- `.env` 不提交 Git，生产环境不得设置 `DEV_AUTH_ROLE=admin`。
- 免费演示默认关闭采集、模型和全部 Agent 网络能力：

```env
COLLECT_ENABLED=false
MODEL_CALLS_ENABLED=false
AGENT_RESEARCH_ENABLED=false
AGENT_RESEARCH_NETWORK_ENABLED=false
AGENT_TRACKING_ENABLED=false
PRODUCT_IMPACT_ENABLED=false
PORT=127.0.0.1:3300
```

`ADMIN_PASSWORD`、`SESSION_SECRET`、`IMG_PROXY_SIGN_SECRET` 和 `POSTGRES_PASSWORD` 仍必须使用
高强度随机值。Quick Tunnel 会把 `/admin` 一并公开，不能因为是临时网址而使用弱密码。

## 启动并验证本地服务

```powershell
docker compose up -d --build
docker compose ps
node scripts/smoke.ts --base http://127.0.0.1:3300
```

`setup` 正常执行迁移后退出不算故障。持续运行的 `db`、`api`、`worker`、`web` 和 `agent`
应处于运行状态，其中 `db` 与 `agent` 应通过健康检查。

## 启动临时 Tunnel

安装官方 `cloudflared` 后运行：

```powershell
cloudflared tunnel --url http://127.0.0.1:3300 --no-autoupdate
```

保持该终端运行。命令会打印一个随机 HTTPS 地址；关闭终端、电脑睡眠或断网都会使地址
失效，下一次创建的地址通常不同。

如果不想安装，可把官方 Windows 便携版放到被 Git 忽略的 `.data/tools/cloudflared.exe`：

```powershell
.\.data\tools\cloudflared.exe tunnel --url http://127.0.0.1:3300 --no-autoupdate
```

## 外网验收

得到地址后，在另一网络或手机流量下检查：

1. 首页、静态资源、RSS、`/api/health` 和 `/api/v1/items` 可访问；
2. `/admin` 仍要求登录，弱密码或免登录配置不存在；
3. `/api/mcp` 可以初始化，Host 校验没有被绕过；
4. 数据库、API 和 Agent Runtime 端口无法从公网直接访问；
5. 后台运行记录没有模型调用、付费采集或 Agent 网络请求。

临时域名与 `.env` 中的 `SITE_URL` 不一致时，绝对链接、分享图和 MCP Host 校验可能仍指向
本机。Quick Tunnel 适合页面演示；需要固定、完整的公开 API/MCP 地址时，应改用已绑定域名
的 Named Tunnel 或正式 HTTPS 部署。

## 停止

先在 Tunnel 终端按 `Ctrl+C`，再按需要停止站点：

```powershell
docker compose stop web api worker agent
```

不要运行 `docker compose down -v`，否则会删除数据库等持久卷。
