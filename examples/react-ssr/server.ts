/**
 * weifuwu + React SSR — full SPA navigation example.
 *
 * Routes:
 *   GET /                  — Home
 *   GET /users             — User list (+ ?_data for SPA)
 *   GET /users/:id         — User detail (+ ?_data for SPA)
 *   GET /admin/dashboard   — Streaming SSR + nested layout
 *   GET /api/hello         — Non-React JSON API
 *   GET /assets/*          — Static client bundle
 *
 * Run:
 *   npm install && npm run build:client && node server.ts
 */

import { serve, Router, logger, trace, serveStatic } from 'weifuwu'
import { react, Link } from 'weifuwu/react'
import { createElement as h } from 'react'
import {
  HomePage, UsersPage, UserDetailPage,
  DashboardPage, NotFoundPage, ErrorDemoPage,
} from './components/pages.ts'

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
      h('title', null, 'weifuwu'),
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
        h(Link, { href: '/' }, 'Home'),
        h(Link, { href: '/users' }, 'Users'),
        h(Link, { href: '/admin/dashboard' }, 'Dashboard'),
        h(Link, { href: '/api/hello' }, 'API'),
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
//
// Pattern: if ?_data → return JSON (for client-side SPA navigation)
//          else      → ctx.render(<Page />, { data }) (SSR with hydration)
//

app.get('/', (_req, ctx) => ctx.render(h(HomePage), {
  head: { title: 'weifuwu React SSR', meta: { description: 'Full-stack framework with React SSR' } },
}))

app.post('/users', async (req, ctx) => {
  const formData = await req.formData()
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const id = MOCK_USERS.length + 1
  MOCK_USERS.push({ id, name, email, bio: '' })
  // Redirect back to users list after creation
  return new Response(null, {
    status: 302,
    headers: { Location: '/users' },
  })
})

app.get('/users', async (_req, ctx) => {
  return ctx.render(h(UsersPage), { head: { title: 'Users' }, data: { users: MOCK_USERS } })
})

app.get('/users/:id', async (req, ctx) => {
  const user = MOCK_USERS.find(u => u.id === Number(ctx.params.id))
  if (!user) {
    return ctx.render(h(NotFoundPage, { path: `/users/${ctx.params.id}` }), { status: 404 })
  }
  return ctx.render(h(UserDetailPage), { head: { title: `${user.name} - Users` }, data: { user } })
})

app.get('/error', (_req, ctx) => ctx.render(h(ErrorDemoPage), {
  head: { title: 'ErrorBoundary Demo' },
}))

// ── Admin area (nested layout via mount) ───────────────────

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

app.onError((err, _req, ctx) => {
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
