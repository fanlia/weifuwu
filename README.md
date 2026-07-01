# weifuwu

**Web-standard HTTP microframework for Node.js** — `(req, ctx) => Response`

```
npm install @weifuwujs/core
```

## Quick start

```ts
import { serve, Router } from '@weifuwujs/core'

const app = new Router()
app.get('/', () => new Response('Hello world!'))
app.get('/api/ping', () => Response.json({ pong: true }))

serve(app.handler(), { port: 3000 })
```

## Packages

| Package | Description |
|---|---|
| [`@weifuwujs/core`](./packages/core) | HTTP microframework — Router, middleware, Postgres, Redis, Queue, AI, GraphQL, `html()` SSR, theme/i18n/flash/csrf |
| [`@weifuwujs/react`](./packages/react) | React SSR — filesystem routing, HMR, hooks |
| [`create-weifuwu`](./packages/create-weifuwu) | Project scaffolding CLI |

## CLI

```bash
npx create-weifuwu my-app           # API-only
npx create-weifuwu my-app --ssr     # React SSR
```

## Migration

The deprecated `weifuwu` (unscopped) package has been removed. Update imports:

| Old | New |
|---|---|
| `import { serve } from 'weifuwu'` | `import { serve } from '@weifuwujs/core'` |
| `import { ssr } from 'weifuwu'` | `import { ssr } from '@weifuwujs/react'` |

## License

MIT
