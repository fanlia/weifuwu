import { Router, layout, view, theme, i18n, flash, wfuwAssets } from 'weifuwu'

export const app = new Router()

// ── Core middleware ──────────────────────────────────────────────
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
app.ws('/chat', {
  open(ws, ctx) {
    ctx.ws.join('lobby')
    ctx.ws.json({ type: 'system', text: 'Connected to weifuwu chat!' })
  },
  message(_ws, ctx, data) {
    const msg = data.toString().trim()
    if (!msg) return
    ctx.ws.sendRoom('lobby', { type: 'chat', text: msg })
  },
})
