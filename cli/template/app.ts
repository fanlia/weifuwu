import { Router, ssr, theme, i18n } from '../../index.ts'

export const app = new Router()
app.use(theme())
app.use(i18n({ dir: './locales' }))
app.use('/', ssr({ dir: './ui' }))
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
