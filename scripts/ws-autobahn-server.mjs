/**
 * Autobahn 套件夹具（W5 门槛——dev-only，不随包发布）
 *
 * 用法：PORT=9300 node scripts/ws-autobahn-server.mjs
 * 语义：echo（text→text / binary→binary——经 core W5 归一）；
 *       分片、ping/pong、关闭码由适配器处理。
 */
import { Router } from '../src/level2/router.ts'
import { serve } from '../src/level2/serve.ts'
import { createNativeWsAdapter } from '../src/level5/server/ws/native/index.ts'

const app = new Router()
app.ws('/ws', {
  message: (ws, _ctx, data) => ws.send(data),
})

const port = Number(process.env.PORT ?? 9300)
const server = serve(app, {
  port,
  hostname: '0.0.0.0',
  wsAdapter: () => createNativeWsAdapter(),
})
await server.ready
console.log(`[autobahn-fixture] native RFC6455 @ ws://127.0.0.1:${server.port}/ws`)
