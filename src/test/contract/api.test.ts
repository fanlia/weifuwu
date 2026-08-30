/**
 * api 中间件契约——真实 HTTP（node 直跑——本地 fixture server——不 mock 网络层）
 *
 * CS-04 精神（协议层测试连真实服务）：apiClient 是 fetch 封装——
 * 测试起真实 HTTP fixture——GET/POST JSON 往返/错误码/超时。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { api, ApiError } from '../../client/vdom/middlewares/api.ts'

let server: Server
let base = ''

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost`)
    res.setHeader('content-type', 'application/json')
    if (url.pathname === '/api/posts/1') {
      res.end(JSON.stringify({ id: 1, title: '你好' }))
    } else if (url.pathname === '/api/posts' && req.method === 'POST') {
      let body = ''
      req.on('data', (c) => { body += c })
      req.on('end', () => {
        const data = JSON.parse(body)
        res.end(JSON.stringify({ id: 2, ...data }))
      })
    } else if (url.pathname === '/api/error') {
      res.statusCode = 500
      res.end('boom')
    } else if (url.pathname === '/api/error-json') {
      // 服务端 {error} 约定体——非 2xx 时 ApiError 必须携带业务错误信息
      res.statusCode = 404
      res.end(JSON.stringify({ error: 'Agent 不存在' }))
    } else if (url.pathname === '/api/rotating') {
      // G13 旋转安全 fixture：模拟「旋转型 refresh token + 过期 access」服务——
      // 请求头 token ≠ 当前有效 token → 401；否则 200 数据
      const auth = req.headers.authorization ?? ''
      const sent = auth.replace('Bearer ', '')
      if (sent === 'valid-after-rotate') {
        res.end(JSON.stringify({ ok: true, data: 42 }))
      } else {
        res.statusCode = 401
        res.end(JSON.stringify({ error: 'Unauthorized' }))
      }
    } else if (url.pathname === '/api/rotating-slow') {
      // 同上 + 50ms 响应延迟——给测试在「请求飞行中」改 token 的窗口
      // （构造：发出时旧 token、401 返回前已有人旋转 → 快照比对分支）
      const auth = req.headers.authorization ?? ''
      const sent = auth.replace('Bearer ', '')
      setTimeout(() => {
        if (sent === 'valid-after-rotate') {
          res.end(JSON.stringify({ ok: true, data: 42 }))
        } else {
          res.statusCode = 401
          res.end(JSON.stringify({ error: 'Unauthorized' }))
        }
      }, 50)
    } else {
      res.statusCode = 404
      res.end('not found')
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const addr = server.address() as { port: number }
  base = `http://127.0.0.1:${addr.port}`
})

after(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

test('get：JSON 往返（真实 HTTP——非 mock）', async () => {
  const client = api({ baseUrl: base })
  const post = await client.get<{ id: number; title: string }>('/api/posts/1')
  assert.equal(post.id, 1)
  assert.equal(post.title, '你好', '中文 JSON 往返')
})

test('post：JSON body 序列化 + 响应解析', async () => {
  const client = api({ baseUrl: base })
  const created = await client.post<{ id: number; title: string }>('/api/posts', { title: '新帖' })
  assert.equal(created.id, 2)
  assert.equal(created.title, '新帖')
})

test('非 2xx → ApiError（状态码透传）', async () => {
  const client = api({ baseUrl: base })
  await assert.rejects(
    client.get('/api/error'),
    (e: unknown) => e instanceof ApiError && (e as ApiError).status === 500,
    '500 → ApiError(status 500)',
  )
})

test('404 → ApiError（路由缺失——非静默）', async () => {
  const client = api({ baseUrl: base })
  await assert.rejects(client.get('/api/missing'), (e: unknown) => e instanceof ApiError)
})

test('非 2xx + JSON {error} 体 → ApiError.message 携带服务端错误信息（状态码透传）', async () => {
  const client = api({ baseUrl: base })
  await assert.rejects(
    client.get('/api/error-json'),
    (e: unknown) =>
      e instanceof ApiError &&
      (e as ApiError).status === 404 &&
      (e as ApiError).message === 'Agent 不存在',
    '404 + {error} 体 → message = 服务端错误信息（客户端错误面不瞎——AgentDetail notFound 误报根因）',
  )
})

test('onError 回调（错误上报钩子——不吞错误）', async () => {
  let seen: ApiError | null = null
  const client = api({ baseUrl: base, onError: (e) => { seen = e } })
  await assert.rejects(client.get('/api/error'))
  assert.ok(seen instanceof ApiError, 'onError 收到错误')
  assert.equal(seen.status, 500)
})

test('G13 旋转安全：请求飞行中 token 已被刷新（快照比对变化）→ 直接重试不触发 onUnauthorized', async () => {
  // 真实缺陷（agent-platform 走查实证）：旋转型 refresh token（一次一换）——
  // 请求 B 带旋转前的 access token 发出 → 401 返回前请求 A 已完成 refresh
  // （token getter 已返回新值）→ 旧代码：B 走 onUnauthorized → 用已作废的
  // refreshToken 再刷 → 失败 → 静默空数据/误踢登录。
  // 修复：401 时比对「此刻 token vs 发出时快照」——已变化 → 直接重试。
  let token = 'expired'
  let refreshCalls = 0
  const client = api({
    baseUrl: base,
    token: () => token,
    onUnauthorized: async () => {
      refreshCalls++
      return true
    },
  })
  const p = client.get<{ data: number }>('/api/rotating-slow')
  setTimeout(() => { token = 'valid-after-rotate' }, 10) // 飞行中：别人完成 refresh
  const data = await p
  assert.equal(data.data, 42, '直接重试成功拿到数据')
  assert.equal(refreshCalls, 0, 'token 已变化 → 不触发刷新钩子（不消耗已旋转的 refreshToken）')
})

test('G13 兼容：401 时 token 未变 → 走 onUnauthorized 刷新重试（原有语义保持）', async () => {
  let refreshCalls = 0
  const solo = api({
    baseUrl: base,
    token: () => 'expired-stale',
    onUnauthorized: async () => {
      refreshCalls++
      return true // 返回 true 但 token 不变 → 重试再 401 → 最终 ApiError（不无限重试）
    },
  })
  await assert.rejects(solo.get('/api/rotating'), (e: unknown) => e instanceof ApiError)
  assert.ok(refreshCalls >= 1, 'token 未变 → 走刷新钩子')
})
