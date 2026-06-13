import { serve } from '../../index.ts'
import { app } from './app.ts'

const port = Number(process.env.PORT) || 3000
const srv = serve(app.handler(), {
  port,
  websocket: app.websocketHandler(),
  shutdown: false,
})

console.log(`Blog app listening on http://localhost:${port}`)

process.on('SIGINT', () => {
  srv.stop()
  process.exit(0)
})
