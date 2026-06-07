import { join } from 'node:path'
import { Router, ssr, layout, tailwind } from '../../index.ts'

const _ui = join(import.meta.dirname, 'ui')

export const app = new Router()
app.use(tailwind(_ui))
app.use(layout(join(_ui, 'layout.tsx')))
app.get('/', ssr(join(_ui, 'page.tsx')))
app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))
app.ws('/ws/echo', { message(ws, _ctx, data) { ws.send(`echo: ${data}`) } })
