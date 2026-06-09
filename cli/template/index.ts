import { loadEnv, serve } from '../../index.ts'
import { app } from './app.ts'

loadEnv()
const port = Number(process.env.PORT) || 3000
const server = serve(app.handler(), { port, websocket: app.websocketHandler() })
await server.ready
console.log(`Listening on http://localhost:${server.port}`)
