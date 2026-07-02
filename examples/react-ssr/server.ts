/**
 * weifuwu + React SSR — file-based component rendering.
 *
 * Routes:
 *   GET /                  — Home
 *   GET /users             — User list (+ ?_data for SPA)
 *   GET /users/:id         — User detail (+ ?_data for SPA)
 *   GET /admin/dashboard   — Streaming SSR + nested layout
 *   GET /api/hello         — Non-React JSON API
 *   GET /assets/*          — Auto-compiled client bundles (esbuildDev + tailwindDev)
 *
 * Run:
 *   npm install && node server.ts
 *
 * Components live in ./components/ — loaded by the framework via esbuild.
 * No tsx, no ts-node, no JSX imports in server.ts.
 */

import { serve, Router, logger, trace, esbuildDev, tailwindDev } from 'weifuwu'
import { react } from 'weifuwu/react'

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
    '/assets/client.js': { entry: './client.ts', bundle: true, external: ['react', 'react-dom/client', 'react/jsx-runtime'], minify: false },
  },
}))

// React SSR (root layout — loaded from file by the framework)
app.use(react({ layout: './components/Layout.tsx' }))

// ── Routes ─────────────────────────────────────────────────

app.get('/', (_req, ctx) => ctx.render('./components/HomePage.tsx', {
  head: { title: 'weifuwu React SSR', meta: { description: 'Full-stack framework with React SSR' } },
}))

app.post('/users', async (req, ctx) => {
  const formData = await req.formData()
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const id = MOCK_USERS.length + 1
  MOCK_USERS.push({ id, name, email, bio: '' })
  return new Response(null, { status: 302, headers: { Location: '/users' } })
})

app.get('/users', async (_req, ctx) => {
  return ctx.render('./components/UsersPage.tsx', { head: { title: 'Users' }, data: { users: MOCK_USERS } })
})

app.get('/users/:id', async (req, ctx) => {
  const user = MOCK_USERS.find(u => u.id === Number(ctx.params.id))
  if (!user) {
    return ctx.render('./components/NotFoundPage.tsx', {
      status: 404,
      props: { path: `/users/${ctx.params.id}` },
    })
  }
  return ctx.render('./components/UserDetailPage.tsx', { head: { title: `${user.name} - Users` }, data: { user } })
})

app.get('/error', (_req, ctx) => ctx.render('./components/ErrorDemoPage.tsx', {
  head: { title: 'ErrorBoundary Demo' },
}))

// ── Admin area (nested layout via mount) ───────────────────

const admin = new Router()
admin.get('/dashboard', async (_req, ctx) => {
  return ctx.renderStream('./components/DashboardPage.tsx')
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
    return ctx.render('./components/NotFoundPage.tsx', {
      status: 500,
      props: { path: 'server error' },
    })
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
