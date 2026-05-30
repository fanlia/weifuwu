# deploy

Turn any VPS into your own PaaS — host multiple weifuwu apps with subdomain routing, zero-downtime updates, auto SSL, and Git-based deployment.

```ts
import { deploy, defineConfig } from 'weifuwu'

await deploy(defineConfig({
  domain: 'example.com',
  deployToken: process.env.DEPLOY_TOKEN,

  apps: {
    blog: {
      repo: 'https://github.com/me/blog.git',
      subdomain: 'blog',
      entry: 'app.ts',
      port: 3001,
    },
    api: {
      repo: 'https://github.com/me/api.git',
      path: '/api',
      entry: 'app.ts',
      port: 3002,
    },
  },
}))
```

---

## 从一台新 VPS 到应用上线

### Step 1: 购买 VPS + 安装 Node.js

```bash
ssh root@你的服务器IP

# 安装 Node.js v24+（weifuwu 需要原生 TS 支持）
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs git
node --version   # 确认 >= 24
```

### Step 2: 创建部署项目

```bash
mkdir -p /opt/deploy && cd /opt/deploy
npm init -y
npm install weifuwu
```

### Step 3: 配置域名解析

在 DNS 管理面板中，将域名和子域名指向 VPS IP：

```
blog.example.com   A → 1.2.3.4
api.example.com    A → 1.2.3.4
*.example.com      A → 1.2.3.4   (可选，泛域名)
```

### Step 4: 写 deploy.ts

```ts
// /opt/deploy/deploy.ts
import { deploy, defineConfig } from 'weifuwu'

await deploy(defineConfig({
  domain: 'example.com',
  deployToken: process.env.DEPLOY_TOKEN,
  ssl: { email: 'admin@example.com' },

  apps: {
    blog: {
      repo: 'https://github.com/me/my-blog.git',
      subdomain: 'blog',
      entry: 'app.ts',
      port: 3001,
      ports: [3001, 3002],   // 零停机更新
    },
  },
}))
```

### Step 5: 启动

```bash
DEPLOY_TOKEN='my-secret-token' node deploy.ts
```

启动瞬间自动完成：

```
  ├─ git clone 博客仓库
  ├─ npm install
  ├─ fork 子进程 (端口 3001)
  ├─ health check → OK
  ├─ 启动反向代理 (端口 80)  → blog.example.com → :3001
  ├─ 启动管理 API (/_deploy/*)
  ├─ 自动申请 SSL 证书 (acme.sh)
  └─ 设置证书自动续期 (cron)
```

### Step 6: 日常更新

```bash
# 在本地开发机
git add . && git commit -m "update"
git push
```

GitHub webhook → `/deploy/webhook` → 自动 git pull + 零停机重启。

---

## 架构

```
                        Port 80/443
                            |
                    Gateway (built-in reverse proxy)
              blog.example.com → :3001
              example.com/api  → :3002
                            |
              ┌─────────────┴─────────────┐
          blog (child process)      api (child process)
          git pull → npm install    git pull → npm install
              │                          │
         Management API at /_deploy
         POST /_deploy/apps/:name/deploy  → git pull + restart
         POST /_deploy/webhook            → GitHub webhook auto-deploy
         GET  /_deploy/apps/:name/logs    → SSE log stream
```

---

## 子域名 & 子路径路由

```ts
apps: {
  blog:  { subdomain: 'blog',            port: 3001 },  // blog.example.com
  api:   { path: '/api',                 port: 3002 },  // example.com/api
  admin: { subdomain: 'admin',           port: 3003 },  // admin.example.com
  www:   { path: '/',                    port: 3004 },  // example.com (root)
}
```

匹配优先级：精确子域名 > 最长路径前缀 > defaultApp。

---

## Blue-green 零停机更新

使用 `ports` 配置两个端口，新进程在备用端口启动通过健康检查后，网关才切换流量：

```ts
apps: {
  blog: {
    repo: 'https://github.com/me/blog.git',
    subdomain: 'blog',
    entry: 'app.ts',
    port: 3001,
    ports: [3001, 3002],
  },
}
```

更新流程：
1. 新进程启动在 3002（旧进程仍在 3001 处理请求）
2. 健康检查通过
3. 网关切换：`blog.example.com` → `:3002`
4. SIGTERM 旧进程（处理完当前请求后退出）

---

## WebSocket

WebSocket 自动桥接，无需额外配置：

```ts
// 在应用里正常写 WebSocket
const app = new Router()
  .ws('/chat', {
    message(ws, _, data) { ws.send(data) },
  })
```

通过 deploy 部署后，`wss://chat.example.com/chat` 自动被网关 bridge。

---

## 进程守护

子进程意外退出后自动重启，指数退避：1s → 2s → 4s → … → 30s 上限。

---

## Git webhook

配置 GitHub/GitLab webhook，push 自动部署：

```ts
defineConfig({
  domain: 'example.com',
  webhookSecret: 'your-github-webhook-secret',  // HMAC 签名验证
  apps: { /* ... */ },
})
```

在 GitHub 仓库 Settings → Webhooks 中添加：
- **Payload URL:** `https://example.com/_deploy/webhook`
- **Secret:** 与 `webhookSecret` 一致
- **Content type:** `application/json`

---

## 自动 SSL (acme.sh)

```ts
defineConfig({
  domain: 'example.com',
  ssl: {
    email: 'admin@example.com',
    staging: true,   // 测试用，避免 Let's Encrypt 频率限制
  },
  apps: { /* ... */ },
})
```

首次运行自动安装 `acme.sh`，签发域名和所有子域名的证书，通过 cron 自动续期。

---

## 管理 API

所有端点需要 `Authorization: Bearer <deployToken>`：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/_deploy/apps` | GET | 列出所有应用及状态 |
| `/_deploy/apps/:name` | GET | 应用详情 |
| `/_deploy/apps/:name/deploy` | POST | git pull + 重启 |
| `/_deploy/apps/:name/restart` | POST | 重启 |
| `/_deploy/apps/:name/stop` | POST | 停止 |
| `/_deploy/apps/:name/start` | POST | 启动 |
| `/_deploy/apps/:name/logs` | GET | SSE 实时日志流 |
| `/_deploy/webhook` | POST | GitHub webhook 接收 |
| `/_deploy/reload` | POST | 重载配置 |

示例：

```bash
curl -H "Authorization: Bearer my-token" https://example.com/_deploy/apps
curl -X POST -H "Authorization: Bearer my-token" https://example.com/_deploy/apps/blog/deploy
curl -H "Authorization: Bearer my-token" https://example.com/_deploy/apps/blog/logs
```

---

## 运行

```bash
node deploy.ts
```

生产环境建议用 systemd 管理：

```ini
# /etc/systemd/system/weifuwu-deploy.service
[Unit]
Description=weifuwu deploy
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/deploy
ExecStart=/usr/bin/node /opt/deploy/deploy.ts
Environment=DEPLOY_TOKEN=my-secret
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable --now weifuwu-deploy
```

---

## API 参考

### `deploy(config)`

| 参数 (DeployConfig) | 默认值 | 说明 |
|---------------------|--------|------|
| `domain` | — | 根域名（必填） |
| `port` | `80` | 网关监听端口 |
| `ssl` | — | `{ email, staging? }` |
| `deployToken` | — | 管理 API 鉴权 |
| `webhookSecret` | — | GitHub webhook HMAC 密钥 |
| `appsDir` | `/opt/weifuwu/apps` | 应用存放目录 |
| `defaultApp` | — | 根域名映射的应用 |
| `apps` | — | 应用配置 |

### `defineConfig(config)`

类型安全的配置辅助函数，自动校验必填字段并补默认值。

### AppConfig

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `repo` | — | Git 仓库 URL（必填） |
| `branch` | `main` | Git 分支 |
| `subdomain` | — | `blog` → `blog.example.com` |
| `path` | — | `/api` → `example.com/api` |
| `port` | — | 内部端口 |
| `ports` | — | `[port, port+1]` 启用 blue-green |
| `entry` | — | 入口文件，如 `app.ts` |
| `env` | — | 环境变量 |
| `healthEndpoint` | `/` | 健康检查路径 |
| `buildCommand` | — | 构建命令，如 `npm run build` |
