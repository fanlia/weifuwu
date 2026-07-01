import { Router, layout, view, theme, i18n, flash, wfuwAssets } from 'weifuwu'
import { WebSocket } from 'ws'

export const app = new Router()

// ── Core middleware ──────────────────────────────────────────────
// Inject host for WebSocket URL construction
app.use((req, ctx, next) => {
  ctx.host = req.headers.get('host') || 'localhost:3000'
  return next(req, ctx)
})
app.use(theme())
app.use(i18n({ dir: './locales' }))
app.use(flash())

// weifuwu-ui static assets
app.use('/', wfuwAssets())

// Layout
app.use(layout('./ui/app/layout.ts'))

// ── Pages ────────────────────────────────────────────────────────
app.get('/', view('./ui/app/page.ts'))
app.get('/chat', view('./ui/app/chat.ts'))

// ── API ──────────────────────────────────────────────────────────
app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))

// ── WebSocket Chat ───────────────────────────────────────────────
const clients = new Set<WebSocket>()

app.ws('/chat', {
  open(ws) {
    clients.add(ws)
    ws.send('Connected to weifuwu chat!')
  },
  message(ws, _ctx, data) {
    const msg = data.toString().trim()
    if (!msg) return
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg)
      }
    }
  },
  close(ws) {
    clients.delete(ws)
  },
})
