# Opencode

> [Home](../README.md) → Opencode

## Opencode

AI programming assistant — chat with LLM agents that have access to filesystem tools, skills, and isolated session workspaces.

```ts
import { serve, Router, postgres, opencode } from 'weifuwu'

const app = new Router()
const pg = postgres()
const oc = await opencode({ pg, permissions: { ... } })

await oc.migrate()
app.use('/opencode', await oc.router())
app.ws('/opencode', oc.wsHandler())

serve(app.handler(), { port: 3000, websocket: app.websocketHandler() })
```

### Session-isolated workspaces

Each session gets its own sandbox directory — tools operate within it, files cannot escape:

```
cwd/.sessions/opencode/1/    ← session 1's workspace
cwd/.sessions/opencode/2/    ← session 2's workspace
cwd/.sessions/chat/3/        ← different mount point
```

Workspaces are computed from `cwd { ctx.mountPath } { sessionId }`. The system prompt shows the session's workspace so the LLM knows where it is.

### Tools

| Tool | Description |
|------|-------------|
| `bash` | Execute shell commands in the workspace |
| `read` | Read files with offset/limit |
| `write` | Create or overwrite files |
| `edit` | Exact string replacements |
| `grep` | Regex content search |
| `glob` | Glob pattern file search |
| `web` | Fetch URL content |
| `question` | Ask the user for input |
| `skill` | Load a skill on demand |

### Skills

Skills are discovered from filesystem and loaded on demand via the `skill` tool — no system prompt bloat:

- Project: `.opencode/skills/{name}/SKILL.md`
- Global: `~/.config/opencode/skills/{name}/SKILL.md`
- Also reads: `.claude/skills/`, `.agents/skills/` (project + global)

```ts
const oc = await opencode({
  pg,
  skills: [{ name: 'git', description: 'Git workflow', content: '...' }],
})
```

### Permissions

Control tool access per conversation:

```ts
const oc = await opencode({
  pg,
  permissions: {
    bash: { allow: true },
    read: { allow: true },
    write: { allow: false },
    edit: { allow: false },
    skill: { '*': { allow: true }, 'internal-*': { allow: false } },
  },
})
```

### Workspace isolation

```ts
const oc = await opencode({ pg, permissions })
// All sessions inherit the instance's workspace (default: process.cwd())
// Sessions cannot override their workspace
// Different mount points = different opencode() instances = isolated workspaces
```

```ts
import { serve, Router, postgres, user } from 'weifuwu'

const app = new Router()
const pg = postgres()
await pg.migrate()

const auth = user({ pg, jwtSecret: process.env.JWT_SECRET! })

// POST /auth/register  { email, password, name }
// POST /auth/login     { email, password }
// GET  /auth/oauth/authorize?client_id=...&redirect_uri=...&response_type=code
// POST /auth/oauth/consent
// POST /auth/oauth/token  (grant_type=authorization_code|client_credentials)
app.use('/auth', auth.router())

// Protected routes — verifies JWT, sets ctx.user
app.get('/me', auth.middleware(), async (req, ctx) => {
  return Response.json(ctx.user)
  // { id, email, name, role }
})
```

Password hashing uses `crypto.scryptSync` + `timingSafeEqual` (Node.js built-in, zero deps). JWT tokens use the `jsonwebtoken` package. The users table (`_users` by default) is auto-created on first `migrate()`.

### OAuth2 Server

Enable OAuth2 Server to let third-party apps (SPA, mobile, microservices) authenticate users through your app.

```ts
const auth = user({
  pg,
  jwtSecret: process.env.JWT_SECRET!,
  oauth2: { server: true },
})

await auth.migrate()  // creates _users + _oauth2_clients + _oauth2_codes + _oauth2_tokens

// Register a client app (programmatic — CLI, admin UI, seed script)
const client = await auth.registerClient({
  name: 'My SPA',
  redirectUris: ['https://myapp.com/callback'],
})
// → { clientId, clientSecret, name, redirectUris }

// Use auth middleware to protect routes — OAuth2 JWT tokens work seamlessly
app.get('/api/data', auth.middleware(), handler)
```

#### Supported Grant Types

| Grant | Use Case | PKCE |
|-------|----------|------|
| `authorization_code` (with client_secret) | Server-side apps | Optional |
| `authorization_code` (with `code_challenge`/`code_verifier`) | SPA / Mobile apps | Required |
| `client_credentials` | Machine-to-machine | — |

#### Flow (Authorization Code + PKCE)

```
1. Third-party app redirects user:
    GET /oauth/authorize?client_id=xxx&redirect_uri=https://app.com/cb
                       &response_type=code&code_challenge=S256&state=yyy

2. User not logged in → 302 to /login?redirect=... → auto returns to consent page after login

3. User confirms consent → POST /oauth/consent { approve: true, client_id, ... }
    302 redirect_uri?code=xxx&state=yyy

4. Third-party app POST /oauth/token
   { grant_type: authorization_code, code, client_id, client_secret,
     redirect_uri, code_verifier }
   → { access_token, token_type: "Bearer", expires_in, refresh_token }

5. access_token is a standard JWT — auth.middleware() and auth.verify() work with it directly
```

#### Client Management

```ts
const client  = await auth.registerClient({ name, redirectUris })
const found   = await auth.getClient(client.clientId)
await auth.revokeClient(client.clientId)
```

#### Using OAuth2 Tokens with the Built-in Auth Middleware

The `access_token` issued by the OAuth2 Server shares the same `jwtSecret` and compatible payload (`sub`, `email`, `role`) as password-login JWTs, so `auth()` can verify OAuth2 tokens without any modifications:

```ts
import { auth } from 'weifuwu'

// Same auth() middleware validates both password-login JWTs and OAuth2 JWTs
app.get('/api', auth({ verify: (token) => auth.verify(token) }), handler)
```

For `client_credentials` tokens (machine-to-machine), `verify()` returns `null` since no user is associated.

### Social Login (GitHub) — Cookbook

`user()` does not bundle social login (to avoid third-party dependencies), but adding a GitHub login with the low-level API takes ~30 lines:

```ts
import { user } from 'weifuwu'
import jwt from 'jsonwebtoken'

const auth = user({ pg, jwtSecret })

// 1. Redirect to GitHub authorization
app.get('/auth/github', () => {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', process.env.GH_CLIENT_ID!)
  url.searchParams.set('redirect_uri', 'http://localhost:3000/auth/github/callback')
  url.searchParams.set('scope', 'user:email')
  return Response.redirect(url.href)
})

// 2. GitHub callback → fetch user info → register/login
app.get('/auth/github/callback', async (req) => {
  const { code } = Object.fromEntries(new URL(req.url).searchParams)
  if (!code) return new Response('Missing code', { status: 400 })

  // Exchange code for token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GH_CLIENT_ID,
      client_secret: process.env.GH_CLIENT_SECRET,
      code,
    }),
  })
  const { access_token } = await tokenRes.json() as any

  // Fetch user info from GitHub
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const ghUser = await userRes.json() as any

  // Find or create local user
  const existing = await pg.sql`SELECT * FROM "_users" WHERE email = ${ghUser.email}`
  let localUser = existing[0]

  if (!localUser) {
    localUser = await auth.register({
      email: ghUser.email,
      password: crypto.randomUUID(),  // Random password — user can only log in via GitHub
      name: ghUser.name ?? ghUser.login,
    })
  }

  // Sign JWT (same format as user())
  const token = jwt.sign(
    { sub: localUser.id, email: localUser.email, role: localUser.role ?? 'user' },
    process.env.JWT_SECRET!,
    { expiresIn: '24h' },
  )
  return Response.json({ token })
})
```

The same pattern works for Google, WeChat, or any OAuth2 provider.
