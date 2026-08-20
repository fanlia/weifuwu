/**
 * vitest globalSetup（node 进程——浏览器测试的 HTTP fixture）
 *
 * client 测试需要真实取数（ctx.data / useChat / api 中间件——AGENTS §3.4
 * key 即 URL）——真实浏览器 fetch → **真实 HTTP server**（src/server 的
 * serve/Router 组件——与生产同源——非 mock）：globalSetup 在 node 进程起
 * fixture server（port 0 随机），baseUrl 经 project.provide → 浏览器测试
 * `inject('baseUrl')` 使用。
 */
import { serve } from '../../server/core/serve.ts'
import { Router } from '../../server/core/router.ts'

interface GlobalSetupProject {
  provide(key: string, value: unknown): void
}

export default async function globalSetup(project: GlobalSetupProject): Promise<() => Promise<void>> {
  // ── fixture 路由（覆盖全部 client 取数测试场景） ──
  let sharedCalls = 0
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' }
  const json = (data: unknown, init?: ResponseInit): Response => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', ...cors } })
  const app = new Router()
    // CORS 预检（useChat POST + JSON 头——非简单请求——浏览器先发 OPTIONS）
    // 全局中间件短路（路由匹配前——精确路由优先于通配——405/404 分支也可拦截）
    .use((req, _ctx, next) => req.method === 'OPTIONS'
      ? new Response(null, { status: 204, headers: cors })
      : next(req, _ctx))
    // ctx.data SPA 取数（key 即 URL）
    .get('/api/user/:id', (_req, ctx) => json({ name: `user-${ctx.params.id}` }))
    // ctx.data 并发合并（calls 进响应体——渲染结果可断言合并）
    .get('/api/shared', () => json({ v: 'shared', calls: ++sharedCalls }))
    // uiSsr / 导航取数
    .get('/api/posts/:id', (_req, ctx) => json({ title: `文章-${ctx.params.id}` }))
    // useChat 流式（NDJSON 分块——5ms 间隔）
    .post('/api/chat', () => {
      const enc = new TextEncoder()
      const stream = new ReadableStream({
        async start(c) {
          for (const line of ['{"content":"你好"}', '{"content":"，我是"}', '{"content":"AI助手"}']) {
            c.enqueue(enc.encode(line + '\n'))
            await new Promise((r) => setTimeout(r, 5))
          }
          c.close()
        },
      })
      return new Response(stream, { headers: cors })
    })
    // useChat error（非 2xx → catch → status error）
    .post('/api/chat-error', () => new Response('boom', { status: 500, headers: cors }))
    // useChat stop（永不响应——abort 中断路径）
    .post('/api/chat-hang', () => new Promise<Response>(() => {}))
    // api 中间件（middlewares 测试——请求记录经响应体/头回传）
    .get('/api/mw/users/1', () => json({ id: 1 }))
    .get('/api/mw/missing', () => new Response('nf', { status: 404, headers: cors }))

  const srv = serve(app, { port: 0, shutdown: false })
  await srv.ready
  project.provide('baseUrl', `http://127.0.0.1:${srv.port}`)
  return async () => {
    await srv.close()
  }
}
