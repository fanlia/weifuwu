import { join } from 'node:path'
import { Router, ssr, preferences } from '../../index.ts'

const _ui = join(import.meta.dirname, 'ui')

export const app = new Router()
app.use('/', ssr({ dir: _ui }))
app.use(preferences({ dir: './locales', locale: { default: 'en' }, theme: { default: 'system' } }))
app.use(async (req, ctx, next) => {
  ctx.loaderData = {
    features: [
      { title: 'SSR + HMR', desc: 'State-preserving hot reload' },
      { title: 'i18n', desc: 'Built-in internationalization' },
      { title: 'Theme', desc: 'Light/dark mode toggle' },
    ],
  }
  return next(req, ctx)
})
app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))
app.ws('/ws/echo', { message(ws, _ctx, data) { ws.send(`echo: ${data}`) } })
