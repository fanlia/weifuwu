/**
 * weifuwu + React SSR.
 *
 * Run: npm install && node server.ts
 *
 * Components in ./components/ — loaded by the framework via esbuild.
 * No tsx, no ts-node, no JSX imports in server.ts.
 */

import { serve, Router, logger, trace, esbuildDev, tailwindDev } from 'weifuwu'
import { react } from 'weifuwu/react'

const MOCK_USERS = [
  { id: 1, name: 'Alice', email: 'alice@example.com', bio: 'Full-stack developer' },
  { id: 2, name: 'Bob', email: 'bob@example.com', bio: 'Designer & artist' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', bio: 'DevOps engineer' },
]

const app = new Router()

app.use(trace())
app.use(logger())

app.use(tailwindDev({
  entries: { '/assets/tailwind.css': { entry: './styles/input.css' } },
}))

app.use(esbuildDev({
  entries: {
    '/assets/vendor.js': { entry: './vendor.ts', bundle: true, minify: false },
    '/assets/client.js': { entry: './client.ts', bundle: true, external: ['react', 'react-dom/client', 'react/jsx-runtime'], minify: false },
  },
}))

// React SSR — injects ctx.render()
app.use(react({ layout: './components/Layout.tsx' }))

// ── Routes ─────────────────────────────────────────────────

app.get('/', (_req, ctx) => ctx.render('./components/HomePage.tsx'))

app.post('/users', async (req, ctx) => {
  const formData = await req.formData()
  MOCK_USERS.push({
    id: MOCK_USERS.length + 1,
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    bio: '',
  })
  return new Response(null, { status: 302, headers: { Location: '/users' } })
})

app.get('/users', async (_req, ctx) => {
  return ctx.render('./components/UsersPage.tsx', { data: { users: MOCK_USERS } })
})

app.get('/users/:id', async (req, ctx) => {
  const user = MOCK_USERS.find(u => u.id === Number(ctx.params.id))
  if (!user) {
    return ctx.render('./components/NotFoundPage.tsx', { status: 404, props: { path: `/users/${ctx.params.id}` } })
  }
  return ctx.render('./components/UserDetailPage.tsx', { data: { user } })
})

app.get('/error', (_req, ctx) => ctx.render('./components/ErrorDemoPage.tsx'))

// ── Admin area (nested layout via mount) ───────────────────

const admin = new Router()
admin.get('/dashboard', async (_req, ctx) => {
  return ctx.render('./components/DashboardPage.tsx')
})
app.mount('/admin', admin)

// ── Non-React API ──────────────────────────────────────────

app.get('/api/hello', () => {
  return Response.json({ message: 'Hello from weifuwu API!', time: new Date().toISOString() })
})

app.onError((err, _req, ctx) => {
  console.error('Unhandled error:', err)
  if (ctx.render) {
    return ctx.render('./components/NotFoundPage.tsx', { status: 500, props: { path: 'server error' } })
  }
  return new Response('Internal Server Error', { status: 500 })
})

const server = serve(app, { port: 3456 })
await server.ready
console.log('\n  🚀  weifuwu React SSR  →  http://localhost:' + server.port)
console.log('  ─────────────────────────────────────────────\n')
