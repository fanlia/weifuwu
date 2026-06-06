import { Router, ssr, layout, tailwind } from 'weifuwu'

export const app = new Router()
app.use(tailwind('./ui'))
app.use(layout('./ui/layout.tsx'))
app.get('/', ssr('./ui/page.tsx'))
app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))
app.ws('/ws/echo', { message(ws, _ctx, data) { ws.send(`echo: ${data}`) } })
