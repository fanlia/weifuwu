# Middleware

> [Home](../README.md) → Middleware

## Built-in middleware

### Auth

```ts
import { auth } from 'weifuwu'

// Static bearer token
app.use(auth({ token: 'sk-123' }))

// Custom verify (JWT, DB, etc.) — return object to set ctx.user
app.use(auth({
  verify: async (token) => {
    const user = await db.findUserByToken(token)
    return user ? { sub: user.id, role: user.role } : null
  },
}))

// Proxy validation to external auth service
app.get('/protected', auth({ proxy: 'http://auth:3000/validate' }), handler)

// Custom header
app.use(auth({ header: 'X-API-Key', token: 'my-key' }))
```

### CORS

```ts
import { cors } from 'weifuwu'

app.use(cors())                                          // allow all
app.use(cors({ origin: ['https://example.com'] }))       // whitelist
app.use(cors({ origin: (o) => o.endsWith('.trusted.com') ? o : false }))
app.use(cors({ credentials: true, maxAge: 3600 }))
```

### Logger

```ts
import { logger } from 'weifuwu'

app.use(logger())                           // GET /hello 200 5ms
app.use(logger({ format: 'combined' }))     // with query params
```

### Rate limit

```ts
import { rateLimit } from 'weifuwu'

app.use(rateLimit({ max: 100, window: 60_000 }))          // 100 req/min
app.get('/api', rateLimit({ max: 10 }), handler)          // per-route

// Custom key (by API key, user ID, etc.)
app.use(rateLimit({
  max: 1000,
  key: (req) => req.headers.get('x-api-key') ?? 'anonymous',
}))
```

### Compression

```ts
import { compress } from 'weifuwu'

app.use(compress())                       // brotli > gzip > deflate
app.use(compress({ threshold: 2048 }))    // only compress > 2KB
```

## Validation

```ts
import { z } from 'zod'
import { validate } from 'weifuwu'

const CreateUser = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

router.post('/users',
  validate({ body: CreateUser }),
  (req, ctx) => {
    // ctx.parsed.body — typed & validated
  },
)
```

## File upload

```ts
import { upload } from 'weifuwu'

router.post('/upload',
  upload({ dir: './uploads', maxFileSize: 10_485_760 }),
  (req, ctx) => {
    // ctx.parsed.files.avatar  → { name, type, size, path }
    // ctx.parsed.fields.title  → 'hello'
  },
)
```

## Cookie

```ts
import { getCookies, setCookie, deleteCookie } from 'weifuwu'

// Read
const cookies = getCookies(req)        // { session: 'abc' }

// Set (immutable — returns new Response)
let res = new Response('ok')
res = setCookie(res, 'session', 'token', { httpOnly: true, secure: true, maxAge: 3600 })

// Delete
res = deleteCookie(res, 'session')
```

## Static files

```ts
import { serveStatic } from 'weifuwu'

router.get('/static/*', serveStatic('./public'))
```

Features: MIME type detection (20+ types), ETag + If-None-Match (304), directory index (index.html), path traversal protection, Cache-Control.
