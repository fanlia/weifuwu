# @weifuwujs/react

**React SSR for weifuwu** — filesystem routing, HMR, hooks

Zero frontend build tools required. Built on React 19 and the weifuwu HTTP microframework.

```
npm install @weifuwujs/react
```

## Quick start

```ts
import { serve, Router } from '@weifuwujs/core'
import { ssr } from '@weifuwujs/react'

const app = new Router()
app.use(ssr({ dir: './ui' }))

app.get('/', () => new Response('Hello world!'))

serve(app.handler(), { port: 3000 })
```

Create a page at `ui/app/page.tsx`:

```tsx
import { useCtx, useLoaderData } from '@weifuwujs/react'

export default function Home() {
  const ctx = useCtx()
  const data = useLoaderData()
  return <h1>Hello, {data.name}!</h1>
}
```

## Features

### Filesystem routing

```
ui/
  app/
    page.tsx          → /
    about/
      page.tsx        → /about
    blog/
      page.tsx        → /blog
      [slug]/
        page.tsx      → /blog/:slug
```

### Middleware

```ts
import { theme, i18n, flash, csrf } from '@weifuwujs/core'

app.use(theme())      // → useTheme(), client-side theme switching
app.use(i18n({ dir: './locales' }))  // → useLocale(), i18n
app.use(flash())      // → useFlashMessage(), flash messages
app.use(csrf())       // → CSRF protection
```

### Client hooks

| Hook | Purpose |
|---|---|
| `useCtx()` | Access server-rendered context on client |
| `useLoaderData()` | Access loader data on client |
| `useTheme()` | Theme toggle (light/dark/system) |
| `useLocale()` | Locale switching |
| `useFlashMessage()` | Flash message display |
| `useAction()` | Form submission |
| `useWebsocket()` | WebSocket with auto-reconnect |
| `useAgentStream()` | Streaming AI agent responses |
| `useFetch()` | Data fetching with cache |
| `Link`, `useNavigate()` | Client-side navigation |
| `createStore()` | Lightweight state management |

### Development

- **HMR** — hot module replacement via WebSocket (`liveRouter`, `liveWatcher`, `liveWs`)
- **Tailwind v4** — CSS compilation (`tailwindRouter`)
- **ESBuild** — TSX compilation on the fly (`compile()`)

## License

MIT
