import { serve, Router, react, logger, trace, cors } from '../../src/index.ts'
import { MOCK_USERS } from './data.ts'

const app = new Router()
  .use(trace())
  .use(logger())
  .use(cors())
  .use(react())
  .get('/api/hello', () => Response.json({ message: 'Hello from weifuwu!', time: new Date().toISOString() }))
  .all('/*', async (req, ctx) => {
    if (req.method === 'POST' && new URL(req.url).pathname === '/users') {
      const formData = await req.formData()
      MOCK_USERS.push({ id: MOCK_USERS.length + 1, name: String(formData.get('name') ?? ''), email: String(formData.get('email') ?? ''), bio: '' })
      return new Response(null, { status: 302, headers: { Location: '/users' } })
    }
    return ctx.render('./ui')
  })

const server = serve(app, { port: 3456 })
await server.ready
console.log('\n  🚀  weifuwu React SSR example  →  http://localhost:' + server.port + '\n')
