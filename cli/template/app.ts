import { Router, layout, view, theme, i18n, cssContext, cssRouter, assetRouter } from 'weifuwu'

export const app = new Router()

// Middleware
app.use(theme())
app.use(i18n({ dir: './locales' }))
app.use(cssContext('./ui'))

// Layout — wraps all pages
app.use(layout('./ui/app/layout.ts'))

// Static assets (HTMX, Alpine)
app.use('/', assetRouter())

// CSS serving
app.use('/', cssRouter('./ui'))

// Pages
app.get('/', view('./ui/app/page.ts'))

// API route
app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))
