import { serve, Router, logger, trace, esbuildDev, tailwindDev, HttpError } from '../../src/index.ts'
import { react } from '../../src/react/index.ts'

const MOCK_USERS = [
  { id: 1, name: 'Alice', email: 'alice@example.com', bio: 'Full-stack developer' },
  { id: 2, name: 'Bob', email: 'bob@example.com', bio: 'Designer & artist' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', bio: 'DevOps engineer' },
]

const app = new Router()
app.use(trace())
app.use(logger())
app.use(tailwindDev({ entries: { '/assets/tailwind.css': { entry: './styles/input.css' } } }))
app.use(esbuildDev({
  entries: {
    '/assets/client.js': { entry: './client.ts', bundle: true, splitting: true, minify: false },
  },
}))
app.use(react({ layout: './components/PageShell.tsx' }))

const ROPTS = { stylesheets: ['/assets/tailwind.css'] as string[], bootstrapModules: ['/assets/client.js'] as string[] }

app.get('/', (_req, ctx) => ctx.render('./components/HomePage.tsx', ROPTS))
app.get('/users', (_req, ctx) => ctx.render('./components/UsersPage.tsx', {
  ...ROPTS,
  loader: async () => ({ users: MOCK_USERS }),
}))
app.get('/users/:id', (_req, ctx) =>
  ctx.render('./components/UserDetailPage.tsx', {
    ...ROPTS,
    loader: async (ctx) => {
      const user = MOCK_USERS.find(u => u.id === Number(ctx.params.id))
      if (!user) throw new HttpError('Not found', 404)
      return { user }
    },
  }),
)
app.get('/error', (_req, ctx) => ctx.render('./components/ErrorDemoPage.tsx', ROPTS))
app.get('/streaming', (_req, ctx) => ctx.render('./components/StreamingDemoPage.tsx', ROPTS))

const admin = new Router()
admin.get('/dashboard', (_req, ctx) => ctx.render('./components/DashboardPage.tsx', ROPTS))
app.mount('/admin', admin)

app.post('/users', async (req) => {
  const formData = await req.formData()
  MOCK_USERS.push({ id: MOCK_USERS.length + 1, name: String(formData.get('name') ?? ''), email: String(formData.get('email') ?? ''), bio: '' })
  return new Response(null, { status: 302, headers: { Location: '/users' } })
})
app.get('/api/hello', () => Response.json({ message: 'Hello from weifuwu API!', time: new Date().toISOString() }))
app.onError((err, _req, ctx) => {
  console.error('Unhandled error:', err)
  const status = err instanceof HttpError ? err.status : 500
  if (ctx.render) return ctx.render('./components/NotFoundPage.tsx', { ...ROPTS, status })
  return new Response('Internal Server Error', { status })
})

const server = serve(app, { port: 3456 })
await server.ready
console.log('\n  🚀  weifuwu React SSR  →  http://localhost:' + server.port + '\n')
