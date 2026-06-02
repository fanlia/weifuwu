# Messager

> [Home](../README.md) → Messager

## Messager

Real-time chat with channels, WebSocket, and agent routing.

```ts
import { messager, agent } from 'weifuwu'

const agents = agent({ pg })
const msg = messager({ pg, agents })

await msg.migrate()
app.use('/api', msg.router())
app.ws('/ws', u.middleware(), msg.wsHandler())
```

### Channels

```http
POST   /channels            name, type (channel|dm), members
GET    /channels
GET    /channels/:id
```

### Messages

```http
GET  /channels/:id/messages     ?limit=50&before={id}
POST /channels/:id/messages     content, sender_type, type
POST /channels/:id/read         last_message_id
```

### WebSocket

```json
{ "type": "message",  "channel_id": 1, "content": "Hi" }
{ "type": "typing",   "channel_id": 1, "is_typing": true }
{ "type": "read",     "channel_id": 1, "last_message_id": 42 }
```

### Programmatic send

```ts
await msg.send(channelId, 'System message', { sender_type: 'system' })
```
