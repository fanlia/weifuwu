import { serve, Router, logger, trace, HttpError } from '../../src/index.ts'
import { react } from '../../src/react/index.ts'

const MOCK_USERS = [
  { id: 1, name: 'Alice', email: 'alice@example.com', bio: 'Full-stack developer' },
  { id: 2, name: 'Bob', email: 'bob@example.com', bio: 'Designer & artist' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com', bio: 'DevOps engineer' },
]

const app = new Router()
  .use(trace())
  .use(logger())
  .plugin(react({
    pages: {
      '/':              './components/HomePage.tsx',
      '/users':         './components/UsersPage.tsx',
      '/users/:id':     './components/UserDetailPage.tsx',
      '/admin/dashboard': './components/DashboardPage.tsx',
      '/error':         './components/ErrorDemoPage.tsx',
      '/streaming':     './components/StreamingDemoPage.tsx',
    },
    layout:        './components/PageShell.tsx',
    layoutExport:  'PageShell',
    notFound:      './components/NotFoundPage.tsx',
    tailwind:      { entry: './styles/input.css' },
    loaders: {
      '/users': async () => ({ users: MOCK_USERS }),
      '/users/:id': async (ctx) => {
        const user = MOCK_USERS.find(u => u.id === Number(ctx.params.id))
        if (!user) throw new HttpError('Not found', 404)
        return { user }
      },
    },
    client: { minify: false },
  }))

app.post('/users', async (req) => {
  const formData = await req.formData()
  MOCK_USERS.push({ id: MOCK_USERS.length + 1, name: String(formData.get('name') ?? ''), email: String(formData.get('email') ?? ''), bio: '' })
  return new Response(null, { status: 302, headers: { Location: '/users' } })
})
app.get('/api/hello', () => Response.json({ message: 'Hello from weifuwu API!', time: new Date().toISOString() }))

const server = serve(app, { port: 3456 })
await server.ready
console.log('\n  🚀  weifuwu React SSR  →  http://localhost:' + server.port + '\n')
