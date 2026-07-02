/**
 * weifuwu + React SSR — full SPA navigation example.
 *
 * Routes:
 *   GET /                  — React SSR home page
 *   GET /users             — React SSR user list (+ ?_data)
 *   GET /users/:id         — React SSR user detail (+ ?_data)
 *   GET /admin/dashboard   — Streaming SSR with nested layout
 *   GET /api/hello         — Non-React JSON API
 *   GET /assets/*          — Static client bundle
 *
 * Run:
 *   npm install && npm run build:client && node server.ts
 */

import { serve, Router, logger, trace, serveStatic } from 'weifuwu'
import { react } from 'weifuwu/react'
import { createElement as h } from 'react'

// ════════════════════════════════════════════════════════════
// Mock data
// ════════════════════════════════════════════════════════════

const MOCK_USERS = [
  { id: 1, name: 'Alice', email: 'alice@example.com', bio: 'Full-stack developer' },
  { id: 2, name: 'Bob', email: 'bob@example.com', bio: 'Designer & artist' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', bio: 'DevOps engineer' },
]

// ════════════════════════════════════════════════════════════
// Layouts
// ════════════════════════════════════════════════════════════

function RootLayout({ children }: { children: unknown }) {
  return h('html', { lang: 'zh' },
    h('head', null,
      h('meta', { charSet: 'utf-8' }),
      h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      h('title', null, 'weifuwu React SSR'),
      h('style', null, `
        body { font-family: system-ui; max-width: 800px; margin: 0 auto; padding: 2rem; }
        nav { display: flex; gap: 1rem; margin-bottom: 2rem; border-bottom: 1px solid #ddd; padding-bottom: 1rem; }
        nav a { color: #333; text-decoration: none; }
        nav a:hover { text-decoration: underline; }
        .card { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
        .user-link { display: block; padding: 0.5rem 0; color: #0066cc; text-decoration: none; }
        .user-link:hover { text-decoration: underline; }
        .back-link { display: inline-block; margin-top: 1rem; color: #0066cc; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
      `),
      h('script', { type: 'module', src: '/assets/client.js' }),
    ),
    h('body', null,
      h('nav', null,
        h('a', { href: '/' }, 'Home'),
        h('a', { href: '/users' }, 'Users'),
        h('a', { href: '/admin/dashboard' }, 'Dashboard'),
        h('a', { href: '/api/hello' }, 'API'),
      ),
      h('div', { id: 'root' }, children),
    ),
  )
}

function AdminLayout({ children }: { children: unknown }) {
  return h('div', { style: { border: '2px solid #e74c3c', borderRadius: '8px', padding: '1rem' } },
    h('div', { style: { color: '#e74c3c', fontWeight: 'bold', marginBottom: '1rem' } }, '🔒 Admin Area'),
    children,
  )
}

// ════════════════════════════════════════════════════════════
// Shared components (rendered identically on server & client)
// ════════════════════════════════════════════════════════════

function HomePage() {
  return h('div', null,
    h('h1', null, 'weifuwu React SSR'),
    h('p', null, 'A web-standard HTTP framework with React server-side rendering.'),
    h('div', { className: 'card' },
      h('h2', null, 'Features'),
      h('ul', null,
        h('li', null, 'ctx.render() — render React to HTML'),
        h('li', null, 'ctx.renderStream() — streaming SSR'),
        h('li', null, 'Layout composition via mount nesting'),
        h('li', null, 'useServerData() — typed data loading'),
        h('li', null, 'Coexists with non-React API routes'),
        h('li', null, h('strong', null, 'NEW: '), 'Client-side SPA navigation with <Link>'),
      ),
    ),
    h('div', { className: 'card', style: { background: '#f0f7ff' } },
      h('h2', null, 'Try it out'),
      h('ol', null,
        h('li', null, h('a', { href: '/users' }, 'Browse users'), ' — click any user to navigate without page reload'),
        h('li', null, h('a', { href: '/admin/dashboard' }, 'Dashboard'), ' — streaming SSR with nested Admin layout'),
        h('li', null, h('a', { href: '/api/hello' }, 'API'), ' — non-React JSON route coexisting with React SSR'),
      ),
    ),
  )
}

function UsersPage({ users }: { users: Array<{ id: number; name: string; email: string }> }) {
  return h('div', null,
    h('h1', null, 'Users'),
    h('p', null, `Click a user to navigate without page reload (SPA navigation).`),
    h('div', { className: 'card' },
      users.length === 0
        ? h('p', null, 'No users found.')
        : users.map(u =>
            h('a', { key: u.id, className: 'user-link', href: `/users/${u.id}` },
              `${u.name} — ${u.email}`,
            ),
          ),
    ),
  )
}

function UserDetailPage({ user }: { user: { id: number; name: string; email: string; bio?: string } }) {
  return h('div', { className: 'card' },
    h('h1', null, user.name),
    h('p', null, h('strong', null, 'Email: '), user.email),
    h('p', null, h('strong', null, 'ID: '), String(user.id)),
    user.bio ? h('p', null, h('em', null, user.bio)) : null,
    h('a', { className: 'back-link', href: '/users' }, '← Back to users'),
  )
}

function DashboardPage() {
  return h('div', null,
    h('h1', null, 'Dashboard'),
    h('p', null, 'This page uses renderStream() — the browser receives chunks progressively.'),
    h('div', { className: 'card' },
      h('h2', null, 'Streaming SSR Stats'),
      h('ul', null,
        h('li', null, 'Users: 42'),
        h('li', null, 'Posts: 128'),
        h('li', null, 'Comments: 512'),
      ),
    ),
  )
}

function NotFoundPage({ path }: { path: string }) {
  return h('div', { className: 'card', style: { borderColor: '#e74c3c' } },
    h('h1', null, '404 — Page Not Found'),
    h('p', null, `No route matches "${path}".`),
    h('a', { className: 'back-link', href: '/' }, '← Go home'),
  )
}

// ════════════════════════════════════════════════════════════
// App setup
// ════════════════════════════════════════════════════════════

const app = new Router()

app.use(trace())
app.use(logger())

// Static assets (client bundle)
app.get('/assets/*', serveStatic('./public'))

// React SSR (root layout)
app.use(react({ layout: RootLayout }))

// ── Routes ─────────────────────────────────────────────────

app.get('/', async (_req, ctx) => {
  return ctx.render(h(HomePage))
})

app.get('/users', async (req, ctx) => {
  if (new URL(req.url).searchParams.has('_data')) {
    return Response.json({ users: MOCK_USERS })
  }
  return ctx.render(h(UsersPage, { users: MOCK_USERS }), { data: { users: MOCK_USERS } })
})

app.get('/users/:id', async (req, ctx) => {
  const user = MOCK_USERS.find(u => u.id === Number(ctx.params.id))
  if (new URL(req.url).searchParams.has('_data')) {
    if (!user) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json({ user })
  }
  if (!user) {
    return ctx.render(h(NotFoundPage, { path: `/users/${ctx.params.id}` }), { status: 404 })
  }
  return ctx.render(h(UserDetailPage, { user }), { data: { user } })
})

// ── Admin area (nested layout) ─────────────────────────────

const admin = new Router()
admin.use(react({ layout: AdminLayout }))

admin.get('/dashboard', async (_req, ctx) => {
  return ctx.renderStream(h(DashboardPage))
})

app.mount('/admin', admin)

// ════════════════════════════════════════════════════════════
// Non-React API
// ════════════════════════════════════════════════════════════

app.get('/api/hello', () => {
  return Response.json({ message: 'Hello from weifuwu API!', time: new Date().toISOString() })
})

// ════════════════════════════════════════════════════════════
// Error handler
// ════════════════════════════════════════════════════════════

app.onError((err, req, ctx) => {
  console.error('Unhandled error:', err)
  if (ctx.render) {
    return ctx.render(
      h('div', { style: { color: 'red', padding: '2rem' } },
        h('h1', null, '500 — Server Error'),
        h('pre', null, err.message),
      ),
      { status: 500 },
    )
  }
  return new Response('Internal Server Error', { status: 500 })
})

// ════════════════════════════════════════════════════════════
// Start
// ════════════════════════════════════════════════════════════

const server = serve(app, { port: 3456 })
await server.ready
console.log(`\n  🚀 weifuwu React SSR + SPA → http://localhost:${server.port}\n`)
