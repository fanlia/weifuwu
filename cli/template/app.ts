import { join } from 'node:path'
import { Router, ssr, rootLayout, preferences } from '../../index.ts'

const _ui = join(import.meta.dirname, 'ui')
const _loc = join(import.meta.dirname, 'locales')

export const app = new Router()
const _uiRouter = rootLayout(_ui)
_uiRouter.get('/', ssr(join(_ui, 'page.tsx')))
app.use('/', _uiRouter)
app.use(preferences({ dir: _loc, locale: { default: 'en' }, theme: { default: 'system' } }))
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
