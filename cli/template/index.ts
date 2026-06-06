import { loadEnv, serve, liveReload } from 'weifuwu'
import { app } from './app.ts'

loadEnv()
if (process.env.NODE_ENV !== 'production') {
  app.use(liveReload({ dirs: ['./ui'] }))
}
const port = Number(process.env.PORT) || 3000
const server = serve(app.handler(), { port, websocket: app.websocketHandler() })
await server.ready
console.log(`Listening on http://localhost:${server.port}`)
