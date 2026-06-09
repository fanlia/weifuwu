# deploy

Multi-process manager with reverse proxy, health checks, auto-restart, and zero-downtime updates. Works identically locally and in production.

```ts
import { deploy, defineConfig } from 'weifuwu'

// Local development
await deploy(defineConfig({
  apps: { blog: {}, api: {} },
}))

// Production
await deploy(defineConfig({
  domain: 'example.com',
  deployToken: process.env.DEPLOY_TOKEN,
  apps: { blog: {}, api: {} },
}))
```

---

## Quick start — local

```ts
// deploy.ts
import { deploy, defineConfig } from 'weifuwu'

await deploy(defineConfig({
  apps: {
    blog: { dir: '../my-blog' },
    api: { dir: '../my-api' },
  },
}))
```

```bash
node deploy.ts
```

```
[deploy] forked blog (pid 12345) on port 3001
[deploy] health check passed
[deploy] forked api (pid 12346) on port 3002
[deploy] health check passed
[deploy] ready at http://localhost:3000

  http://localhost:3000/blog  → blog (port 3001)
  http://localhost:3000/api   → api  (port 3002)
  http://localhost:3000/_deploy/apps → management API
```

---

## Quick start — production

Add a reverse proxy for TLS (Caddy is recommended):

```caddy
# Caddyfile
example.com, *.example.com {
    reverse_proxy localhost:3000
}
```

```ts
// deploy.ts — same as local
import { deploy, defineConfig } from 'weifuwu'

await deploy(defineConfig({
  domain: 'example.com',
  deployToken: process.env.DEPLOY_TOKEN,
  apps: { blog: {}, api: {}, admin: {} },
}))
```

```bash
node deploy.ts
```

```
https://blog.example.com  → blog (port 3001)
https://example.com/api   → api  (port 3002)
                         → admin (port 3003)
```

---

## Auto-derived defaults

```ts
defineConfig({ apps: { blog: {} } })
```

| Field | Derived value | Rule |
|-------|---------------|------|
| `dir` | `'blog'` | Defaults to app key |
| `entry` | `'index.ts'` | Default entry file |
| `port` | `3001` | Auto-incremented from 3001 |
| `path` | `'/blog'` | Only for `localhost` domain |

Override any field explicitly:

```ts
defineConfig({
  apps: {
    blog: {
      dir: '../packages/blog',
      entry: 'server.ts',
      port: 8080,
      path: '/blog',
    },
  },
})
```

---

## Routing

Match priority: **explicit path** > **app key** > **defaultApp**.

### Explicit path

```ts
apps: {
  api: { path: '/api' },   // example.com/api  or  localhost:3000/api
}
```

### App key (no path)

```ts
apps: {
  blog: {},                 // blog.example.com  or  localhost:3000/blog
}
```

On a real domain, `blog` matches `blog.example.com`. On localhost, it matches `/blog`.

### Default app

```ts
defineConfig({
  defaultApp: 'blog',
  apps: { blog: {}, api: {} },
})
// example.com/         → blog
// example.com/api      → api
```

---

## Zero-downtime updates

Use `ports` for blue-green deployment — new process starts on the alternate port before the old one is killed:

```ts
apps: {
  blog: {
    ports: [3001, 3002],
  },
}
```

1. New process starts on port 3002 (old process still handles traffic on 3001)
2. Health check passes
3. Gateway switches: `blog.example.com` → `:3002`
4. SIGTERM old process (finishes current requests then exits)

---

## WebSocket

WebSocket connections are automatically bridged through the gateway:

```ts
app.ws('/chat', {
  message(ws, _, data) { ws.send(data) },
})
```

---

## Process watchdog

If a child process exits unexpectedly, deploy auto-restarts it with exponential backoff: 1s → 2s → 4s → … → 30s max.

---

## Management API

All endpoints require `Authorization: Bearer <deployToken>` (unauthenticated when token is not set):

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/_deploy/apps` | GET | List all apps |
| `/_deploy/apps/:name` | GET | App details |
| `/_deploy/apps/:name/deploy` | POST | Restart |
| `/_deploy/apps/:name/restart` | POST | Restart |
| `/_deploy/apps/:name/stop` | POST | Stop |
| `/_deploy/apps/:name/start` | POST | Start |
| `/_deploy/apps/:name/logs` | GET | SSE log stream |

```bash
curl -H "Authorization: Bearer my-token" http://localhost:3000/_deploy/apps
curl -X POST -H "Authorization: Bearer my-token" http://localhost:3000/_deploy/apps/blog/stop
curl -H "Authorization: Bearer my-token" http://localhost:3000/_deploy/apps/blog/logs
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

---

## API Reference

### `defineConfig(config)`

Type-safe config helper. Sets defaults and returns a normalized `DeployConfig`.

### DeployConfig

| Option | Default | Description |
|--------|---------|-------------|
| `domain` | `'localhost'` | Root domain for routing |
| `port` | `3000` | Gateway listen port |
| `deployToken` | — | Bearer token for management API |
| `defaultApp` | — | App to route bare domain to |
| `apps` | — | `Record<string, AppConfig>` |

### AppConfig

| Field | Default | Description |
|-------|---------|-------------|
| `dir` | App key | Directory containing the app |
| `port` | Auto (3001+) | Internal port |
| `entry` | `'index.ts'` | Entry file |
| `path` | `'/key'` (local) | URL path prefix |
| `env` | — | Environment variables |
| `healthEndpoint` | `/` | Health check path |
| `buildCommand` | — | Build command, e.g. `npm run build` |
| `ports` | — | `[port, port+1]` enables blue-green |
