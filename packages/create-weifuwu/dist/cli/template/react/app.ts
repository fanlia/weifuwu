import { Router, theme, i18n, flash, csrf } from '@weifuwujs/core'
import { ssr } from '@weifuwujs/react'

export const app = new Router()

// ── SSR middleware ───────────────────────────────────────────────
// Order matters: theme/i18n/flash must be registered before ssr()
// so ctx.theme, ctx.i18n, ctx.flash are available to page templates.
app.use(theme().middleware())
app.use(i18n({ dir: './locales' }).middleware())
app.use(flash())
app.use(csrf())

// ── SSR route switches (handle /__theme/dark, /__lang/zh-CN) ───
app.mount('/', theme())
app.mount('/', i18n())

// ── React SSR (filesystem routing from ./ui/app/…) ──────────────
//   app/page.tsx → /, app/blog/[slug]/page.tsx → /blog/:slug
app.mount('/', ssr({ dir: './ui' }))

// ── API ───────────────────────────────────────────────────────────
app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))

// ── WebSocket Chat ───────────────────────────────────────────────
app.ws('/chat', {
  open(ws, ctx) {
    ctx.ws.join('lobby')
    ctx.ws.json({ type: 'system', text: 'Connected!' })
  },
  message(_ws, ctx, data) {
    const msg = data.toString().trim()
    if (!msg) return
    ctx.ws.sendRoom('lobby', { type: 'chat', text: msg })
  },
})
