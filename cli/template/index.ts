import { loadEnv, serve } from '../../index.ts'
import { app } from './app.ts'

loadEnv()
const port = Number(process.env.PORT) || 3000
const srv = serve(app.handler(), { port, websocket: app.websocketHandler(), shutdown: false })
process.on('SIGINT', () => {
  srv.stop()
  process.exit(0)
})
