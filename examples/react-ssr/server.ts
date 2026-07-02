/**
 * weifuwu + React SSR example
 *
 * Demo:
 *   GET /              — React SSR home page
 *   GET /users         — React SSR list
 *   GET /users/:id     — React SSR detail with data loading
 *   GET /dashboard     — React SSR streaming
 *   GET /api/hello     — Non-React JSON API
 *
 * Run:
 *   npm install && npm start
 */

import { serve, Router, logger, trace } from 'weifuwu'
import { react } from 'weifuwu/react'
import { createElement as h } from 'react'

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
        .user-link { display: block; padding: 0.5rem 0; }
      `),
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
// Pages
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
      ),
    ),
  )
}

function UsersPage({ users }: { users: Array<{ id: number; name: string; email: string }> }) {
  return h('div', null,
    h('h1', null, 'Users'),
    h('div', { className: 'card' },
      users.map(u =>
        h('a', { key: u.id, className: 'user-link', href: `/users/${u.id}` },
          `${u.name} (${u.email})`,
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
    user.bio && h('p', null, h('em', null, user.bio)),
    h('a', { href: '/users' }, '← Back to users'),
  )
}

function DashboardPage() {
  return h('div', null,
    h('h1', null, 'Dashboard (Streaming SSR)'),
    h('div', { className: 'card' },
      h('h2', null, 'Stats'),
      h('ul', null,
        h('li', null, 'Users: 42'),
        h('li', null, 'Posts: 128'),
        h('li', null, 'Comments: 512'),
      ),
    ),
    h('p', null, 'This page uses renderStream() — the browser receives chunks progressively.'),
  )
}

// ════════════════════════════════════════════════════════════
// Mock data
// ════════════════════════════════════════════════════════════

const MOCK_USERS = [
  { id: 1, name: 'Alice', email: 'alice@example.com', bio: 'Full-stack developer' },
  { id: 2, name: 'Bob', email: 'bob@example.com', bio: 'Designer & artist' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', bio: 'DevOps engineer' },
]

// ════════════════════════════════════════════════════════════
// App setup
// ════════════════════════════════════════════════════════════

const app = new Router()

// Global middleware
app.use(trace())
app.use(logger())

// React SSR (root layout)
app.use(react({ layout: RootLayout }))

// ── Public routes ──────────────────────────────────────────

app.get('/', async (_req, ctx) => {
  return ctx.render(h(HomePage))
})

app.get('/users', async (_req, ctx) => {
  return ctx.render(h(UsersPage, { users: MOCK_USERS }))
})

app.get('/users/:id', async (req, ctx) => {
  const user = MOCK_USERS.find(u => u.id === Number(ctx.params.id))
  if (!user) {
    return ctx.render(h('h1', null, '404 — User Not Found'), { status: 404 })
  }
  return ctx.render(h(UserDetailPage, { user }), { data: { user } })
})

// ── Admin area (nested layout) ─────────────────────────────

const admin = new Router()
admin.use(react({ layout: AdminLayout }))

admin.get('/dashboard', async (_req, ctx) => {
  // Use streaming for the dashboard
  return ctx.renderStream(h(DashboardPage))
})

app.mount('/admin', admin)

// ════════════════════════════════════════════════════════════
// Non-React API route (coexists with React routes)
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
      h('div', { style: 'color: red' },
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
console.log(`\n  🚀 weifuwu React SSR example running at http://localhost:${server.port}`)
console.log(`  Routes:`)
console.log(`    /              — React SSR home page`)
console.log(`    /users         — React SSR user list`)
console.log(`    /users/:id     — React SSR user detail`)
console.log(`    /dashboard     — React SSR (admin area + streaming)`)
console.log(`    /api/hello     — Non-React JSON API\n`)
