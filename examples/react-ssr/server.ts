import { serve, Router, react, logger, trace } from '../../src/index.ts'
import { MOCK_USERS } from './data.ts'

const app = new Router()
  .use(trace())
  .use(logger())
  .use(react())
  .post('/users', async (req) => {
    const formData = await req.formData()
    MOCK_USERS.push({
      id: MOCK_USERS.length + 1,
      name: String(formData.get('name') ?? ''),
      email: String(formData.get('email') ?? ''),
      bio: '',
    })
    return new Response(null, { status: 302, headers: { Location: '/users' } })
  })
  .get('/api/hello', () => Response.json({
    message: 'Hello from weifuwu!',
    time: new Date().toISOString(),
  }))
  .get('/*', async (req, ctx) => ctx.render('./ui'))

const server = serve(app, { port: 3456 })
await server.ready
console.log('\n  🚀  weifuwu React SSR  →  http://localhost:' + server.port + '\n')
