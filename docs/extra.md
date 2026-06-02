# Health, i18n, Email & Testing

> [Home](../README.md) → Extra

## Health check

```ts
import { serve, Router, health } from 'weifuwu'

const app = new Router()
app.use(health())                              // GET /health → 200
app.use(health({ path: '/healthz' }))          // custom path
app.use(health({
  check: async () => { await db.sql`SELECT 1` },  // fail → 503
}))
serve(app.handler(), { port: 3000 })
```

Returns a `Router` — mount with `app.use()`.

## Internationalization

```ts
import { i18n } from 'weifuwu'

app.use(i18n({ dir: './locales', defaultLocale: 'en' }))

// In any handler after i18n middleware:
app.get('/hello', (req, ctx) => {
  const msg = ctx.t('greeting', { name: 'World' })
  return Response.json({ message: msg, locale: ctx.locale })
})
```

Locale detection: `Cookie: locale=zh` → `Accept-Language: zh-CN` → `defaultLocale`.

## Email

```ts
import { mailer } from 'weifuwu'

// SMTP transport
const mail = mailer({
  transport: 'smtp://user:pass@smtp.example.com',
  from: 'noreply@example.com',
})
await mail.send({ to: 'user@example.com', subject: 'Welcome', html: '<h1>Hi!</h1>' })
await mail.close()

// Custom transport (Resend, SES, SendGrid, etc.)
const mail2 = mailer({
  send: async (msg) => { await resend.emails.send(msg) },
})
await mail2.send({ to: 'user@example.com', subject: 'Hi', text: 'Hello' })
await mail2.close()
```

## Test utilities

```ts
import { createTestServer } from 'weifuwu'

const { server, url } = await createTestServer(app.handler())
const res = await fetch(`${url}/api/users`)
assert.equal(res.status, 200)
server.stop()
```
