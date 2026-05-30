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

## From a fresh VPS to a running app

### Step 1: Provision a VPS + install Node.js

```bash
ssh root@your-server-ip

# Install Node.js v24+ (weifuwu needs native TS support)
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs git
node --version   # must be >= 24
```

### Step 2: Create the deploy project

```bash
mkdir -p /opt/deploy && cd /opt/deploy
npm init -y
npm install weifuwu
```

### Step 3: Configure DNS

Point your domain and subdomains to the VPS IP:

```
blog.example.com   A → 1.2.3.4
api.example.com    A → 1.2.3.4
*.example.com      A → 1.2.3.4   (optional, wildcard)
```

### Step 4: Write deploy.ts

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
      ports: [3001, 3002],   // zero-downtime updates
    },
  },
}))
```

### Step 5: Start

```bash
DEPLOY_TOKEN='my-secret-token' node deploy.ts
```

On startup, deploy automatically:

```
  ├─ git clone the app repo
  ├─ npm install
  ├─ fork child process (port 3001)
  ├─ health check → OK
  ├─ start reverse proxy (port 80)  → blog.example.com → :3001
  ├─ start management API (/_deploy/*)
  ├─ issue SSL certificate via acme.sh
  └─ set up auto-renewal cron job
```

### Step 6: Daily updates

```bash
# On your dev machine
git add . && git commit -m "update"
git push
```

GitHub webhook → `/_deploy/webhook` → auto git pull + zero-downtime restart.

---

## Architecture

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

## Subdomain & path routing

```ts
apps: {
  blog:  { subdomain: 'blog',            port: 3001 },  // blog.example.com
  api:   { path: '/api',                 port: 3002 },  // example.com/api
  admin: { subdomain: 'admin',           port: 3003 },  // admin.example.com
  www:   { path: '/',                    port: 3004 },  // example.com (root)
}
```

Match priority: exact subdomain > longest path prefix > defaultApp.

---

## Blue-green zero-downtime deployment

Use `ports` to enable rolling restarts — the new process starts on the alternate port before the old one is killed:

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

Deploy flow:
1. New process starts on port 3002 (old process still handles traffic on 3001)
2. Health check passes
3. Gateway switches: `blog.example.com` → `:3002`
4. SIGTERM old process (finishes current requests then exits)

---

## WebSocket

WebSocket connections are automatically bridged through the gateway. No extra config needed:

```ts
// In your app — works through deploy automatically
const app = new Router()
  .ws('/chat', {
    message(ws, _, data) { ws.send(data) },
  })
```

---

## Process watchdog

If a child process exits unexpectedly, deploy auto-restarts it with exponential backoff: 1s → 2s → 4s → … → 30s max.

---

## Git webhook

Configure GitHub/GitLab webhook for push-triggered deployment:

```ts
defineConfig({
  domain: 'example.com',
  webhookSecret: 'your-github-webhook-secret',  // optional HMAC verification
  apps: { /* ... */ },
})
```

In your GitHub repo: Settings → Webhooks → Add webhook:
- **Payload URL:** `https://example.com/_deploy/webhook`
- **Secret:** must match `webhookSecret`
- **Content type:** `application/json`

---

## Auto SSL (acme.sh)

```ts
defineConfig({
  domain: 'example.com',
  ssl: {
    email: 'admin@example.com',
    staging: true,   // use --staging to avoid Let's Encrypt rate limits during testing
  },
  apps: { /* ... */ },
})
```

On first run, deploy installs `acme.sh`, issues certificates for the domain and all subdomains, and sets up automatic renewal via cron.

---

## Management API

All endpoints require `Authorization: Bearer <deployToken>`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/_deploy/apps` | GET | List all apps and their status |
| `/_deploy/apps/:name` | GET | Get app details |
| `/_deploy/apps/:name/deploy` | POST | git pull + restart |
| `/_deploy/apps/:name/restart` | POST | Restart |
| `/_deploy/apps/:name/stop` | POST | Stop |
| `/_deploy/apps/:name/start` | POST | Start |
| `/_deploy/apps/:name/logs` | GET | SSE real-time log stream |
| `/_deploy/webhook` | POST | GitHub webhook receiver |
| `/_deploy/reload` | POST | Reload config |

Examples:

```bash
curl -H "Authorization: Bearer my-token" https://example.com/_deploy/apps
curl -X POST -H "Authorization: Bearer my-token" https://example.com/_deploy/apps/blog/deploy
curl -H "Authorization: Bearer my-token" https://example.com/_deploy/apps/blog/logs
```

---

## Running

```bash
node deploy.ts
```

For production, use systemd:

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

## API Reference

### `deploy(config)`

| Option (DeployConfig) | Default | Description |
|-----------------------|---------|-------------|
| `domain` | — | Root domain (required) |
| `port` | `80` | Gateway listen port |
| `ssl` | — | `{ email, staging? }` — auto SSL |
| `deployToken` | — | Bearer token for management API |
| `webhookSecret` | — | GitHub webhook HMAC secret |
| `appsDir` | `/opt/weifuwu/apps` | Where apps are cloned |
| `defaultApp` | — | App to route bare domain to |
| `apps` | — | `Record<string, AppConfig>` |

### `defineConfig(config)`

Type-safe config helper. Validates required fields and sets defaults.

### AppConfig

| Field | Default | Description |
|-------|---------|-------------|
| `repo` | — | Git repository URL (required) |
| `branch` | `main` | Git branch |
| `subdomain` | — | `blog` → `blog.example.com` |
| `path` | — | `/api` → `example.com/api` |
| `port` | — | Internal port |
| `ports` | — | `[port, port+1]` enables blue-green |
| `entry` | — | Entry file, e.g. `app.ts` |
| `env` | — | Environment variables |
| `healthEndpoint` | `/` | Health check path |
| `buildCommand` | — | Build command, e.g. `npm run build` |
