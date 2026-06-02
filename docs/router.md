# Router

> [Home](../README.md) → Router

## Router

```ts
import { serve, Router } from 'weifuwu'

const app = new Router()
  .use((req, ctx, next) => {
    console.log(`${req.method} ${new URL(req.url).pathname}`)
    return next(req, ctx)
  })
  .get('/hello/:name', (req, ctx) =>
    Response.json({ message: `Hello, ${ctx.params.name}!` }),
  )
  .post('/data', async (req, ctx) => {
    const body = await req.json()
    return Response.json(body, { status: 201 })
  })

serve(app.handler(), { port: 3000 })
```

## WebSocket

```json
{ "type": "message",  "channel_id": 1, "content": "Hi" }
{ "type": "typing",   "channel_id": 1, "is_typing": true }
{ "type": "read",     "channel_id": 1, "last_message_id": 42 }
```

### Programmatic send

```ts
await msg.send(channelId, 'System message', { sender_type: 'system' })
```

## Error handling

```ts
const app = new Router()
  .onError((err, req, ctx) =>
    Response.json({ error: err.message }, { status: 500 }),
  )
  .get('/crash', () => { throw new Error('boom') })
```

## Graceful shutdown

```ts
import { serve } from 'weifuwu'
import type { Server } from 'weifuwu'

const ac = new AbortController()
let server: Server

process.on('SIGTERM', () => {
  ac.abort()
  server.stop()
})

server = serve((req, ctx) => new Response('Hello'), {
  port: 3000,
  signal: ac.signal,
})
await server.ready
```

### Using with WebSocket

```ts
const app = new Router().ws('/chat', { … })
const server = serve(app.handler(), {
  port: 3000,
  signal: ac.signal,
  websocket: app.websocketHandler(),
})
```
