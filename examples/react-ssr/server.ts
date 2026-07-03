import { serve, Router, logger, trace, esbuildDev, tailwindDev, HttpError } from '../../src/index.ts'
import { react, reactRouter } from '../../src/react/index.ts'
import { routes } from './routes.ts'

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

reactRouter(app, routes, {
  ...ROPTS,
  loaders: {
    '/users': async () => ({ users: MOCK_USERS }),
    '/users/:id': async (ctx) => {
      const user = MOCK_USERS.find(u => u.id === Number(ctx.params.id))
      if (!user) throw new HttpError('Not found', 404)
      return { user }
    },
  },
})

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
