import { loadEnv, serve } from '@weifuwujs/core'
import { app } from './app.ts'

loadEnv()
const port = Number(process.env.PORT) || 3000
serve(app, { port })
