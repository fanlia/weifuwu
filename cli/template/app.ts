import { Router, layout, view, theme, i18n, flash, wfuwAssets } from 'weifuwu'

export const app = new Router()

// Core middleware
app.use(theme())
app.use(i18n({ dir: './locales' }))
app.use(flash())

// weifuwu-ui static assets
app.use('/', wfuwAssets())

// Layout
app.use(layout('./ui/app/layout.ts'))

// Pages
app.get('/', view('./ui/app/page.ts'))

// API route
app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))
