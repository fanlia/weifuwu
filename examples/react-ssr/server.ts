/**
 * weifuwu + React SSR — full SPA navigation example.
 *
 * Routes:
 *   GET /                  — Home
 *   GET /users             — User list (+ ?_data for SPA)
 *   GET /users/:id         — User detail (+ ?_data for SPA)
 *   GET /admin/dashboard   — Streaming SSR + nested layout
 *   GET /api/hello         — Non-React JSON API
 *   GET /assets/*          — Auto-compiled client bundle (esbuildDev)
 *
 * Run:
 *   npm install && node server.ts
 */

import { serve, Router, logger, trace, esbuildDev, tailwindDev } from 'weifuwu'
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
      h('link', { rel: 'stylesheet', href: '/assets/tailwind.css' }),
      h('script', { type: 'importmap', dangerouslySetInnerHTML: { __html: JSON.stringify({
        imports: { react: '/assets/vendor.js', 'react-dom/client': '/assets/vendor.js' },
      }) } }),
      h('script', { type: 'module', src: '/assets/client.js' }),
    ),
    h('body', { className: 'font-sans max-w-3xl mx-auto p-8' },
      h('nav', { className: 'flex gap-4 mb-8 border-b border-gray-200 pb-4' },
        h(Link, { href: '/', className: 'text-gray-700 no-underline hover:underline' }, 'Home'),
        h(Link, { href: '/users', className: 'text-gray-700 no-underline hover:underline' }, 'Users'),
        h(Link, { href: '/admin/dashboard', className: 'text-gray-700 no-underline hover:underline' }, 'Dashboard'),
        h(Link, { href: '/api/hello', className: 'text-gray-700 no-underline hover:underline' }, 'API'),
      ),
      h('div', { id: 'root' }, children),
    ),
  )
}

// ════════════════════════════════════════════════════════════
// App setup
// ════════════════════════════════════════════════════════════

const app = new Router()

app.use(trace())
app.use(logger())

// Auto-compile CSS on-the-fly (Tailwind v4)
app.use(tailwindDev({
  entries: {
    '/assets/tailwind.css': { entry: './styles/input.css' },
  },
}))

// Auto-compile client bundles on-the-fly (no build step needed)
app.use(esbuildDev({
  entries: {
    '/assets/vendor.js': { entry: './vendor.ts', bundle: true, minify: false },
    '/assets/client.js': { entry: './client.ts', bundle: true, external: ['react', 'react-dom/client'], minify: false },
  },
}))

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
// mount nesting demo — DashboardPage includes its own admin UI
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
console.log('\n  🚀  weifuwu React SSR + SPA  →  http://localhost:' + server.port)
console.log('  ─────────────────────────────────────────────')
console.log('  /                   Home — feature overview')
console.log('  /users              Users — SPA nav + Form submit + loading')
console.log('  /users/:id          User detail — ErrorBoundary + dynamic title')
console.log('  /admin/dashboard    Dashboard — streaming SSR + nested layout')
console.log('  /error              ErrorBoundary usage reference')
console.log('  /api/hello          Non-React JSON API')
console.log('  /assets/client.js   Client bundle (~5KB)')
console.log('  ─────────────────────────────────────────────\n')
