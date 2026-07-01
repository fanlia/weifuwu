import { loadEnv, serve } from 'weifuwu'
import { app } from './app.ts'

loadEnv()
const port = Number(process.env.PORT) || 3000
serve(app.handler(), { port, websocket: app.websocketHandler() })
