import { loadEnv, serve } from '../../index.ts'
import { app } from './app.ts'

loadEnv()
const port = Number(process.env.PORT) || 3000
const isWatchMode = process.execArgv.includes('--watch')
serve(app.handler(), { port, websocket: app.websocketHandler(), shutdown: !isWatchMode })
