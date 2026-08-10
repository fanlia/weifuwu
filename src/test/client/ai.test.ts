/**
 * weifuwu/client AI 解码器测试 — 端到端：后端 wf: SSE 编码 → 前端解码分发
 *
 * wire-fake：真 HTTP 服务器，按协议 §1.1 输出 wf: 事件（与后端 ai.stream 输出同构）。
 * 不 mock fetch、不 mock 网络层（CS-04 精神）。
 */

import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { WfStreamEvent } from '../../ai/types.ts'

const { aiStream } = await import('../../ui-dom/ai.ts')

// ── wire-fake：输出 wf: SSE 的真实服务器 ───────────────────

interface FakeServer {
  url: string
  close: () => Promise<void>
  lastTraceId: () => string | null
}

function startWfServer(handler: (req: import('node:http').IncomingMessage, body: unknown) => string[]): Promise<FakeServer> {
  let lastTraceId: string | null = null
  const server: Server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk
    lastTraceId = req.headers['x-trace-id'] as string | null
    const body = JSON.parse(raw || '{}')
    const lines = handler(req, body)
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
    for (const line of lines) res.write(line)
    res.end()
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      resolve({
        url: `http://127.0.0.1:${port}/api/chat`,
        close: () => new Promise((r) => server.close(() => r())),
        lastTraceId: () => lastTraceId,
      })
    })
  })
}

const ev = (name: string, data: unknown): string => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`

// ── 测试 ──────────────────────────────────────────────────

describe('aiStream 解码器', () => {
  const servers: FakeServer[] = []
  afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.close())) })

  it('按事件名分发 token / tool_call / done 回调', async () => {
    const fake = await startWfServer(() => [
      ev('wf:message_start', { id: '9f3a' }),
      ev('wf:token', { text: '你' }),
      ev('wf:token', { text: '好' }),
      ev('wf:tool_call', { id: 'tc_1', name: 'query_orders', args: { userId: 'u1' } }),
      ev('wf:done', { content: '你好', usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    ])
    servers.push(fake)

    const got: string[] = []
    const handle = aiStream(fake.url, { messages: [] }, {
      onToken: (t) => got.push(`token:${t}`),
      onToolCall: (c) => got.push(`tool:${c.name}`),
      onDone: (d) => got.push(`done:${d.content}`),
    })
    await handle.done

    assert.deepEqual(got, ['token:你', 'token:好', 'tool:query_orders', 'done:你好'])
  })

  it('x:* 自定义事件透传 onEvent，未知 wf: 事件透传不抛错（前向兼容）', async () => {
    const fake = await startWfServer(() => [
      ev('x:thinking', { stage: 'planning' }),
      ev('wf:future_unknown', { anything: true }),   // 未来 wf 事件（向后兼容）
      ev('wf:done', { content: '' }),
    ])
    servers.push(fake)

    const customs: string[] = []
    const handle = aiStream(fake.url, {}, { onEvent: (name, data) => customs.push(`${name}:${(data as any).stage ?? 'x'}`) })
    await handle.done
    // 未知事件（含未来 wf:）透传 onEvent；已订阅事件（wf:done 无回调）跳过
    assert.deepEqual(customs, ['x:thinking:planning', 'wf:future_unknown:x'])
  })

  it('record 录制事件序列（可导出为测试 fixture）', async () => {
    const fake = await startWfServer(() => [
      ev('wf:message_start', { id: 't1' }),
      ev('wf:token', { text: 'hi' }),
      ev('wf:done', { content: 'hi' }),
    ])
    servers.push(fake)

    const handle = aiStream(fake.url, {})
    await handle.done
    const names = handle.events.map((e) => e.name)
    assert.deepEqual(names, ['wf:message_start', 'wf:token', 'wf:done'])
    // 导出即 JSON（fixture 直接可用）
    const exported = JSON.parse(JSON.stringify(handle.events)) as WfStreamEvent[]
    assert.equal(exported[1].name, 'wf:token')
  })

  it('trace 桥：默认自动生成 X-Trace-Id 并发送；可显式指定', async () => {
    const fake = await startWfServer(() => [ev('wf:done', { content: '' })])
    servers.push(fake)

    const auto = aiStream(fake.url, {})
    await auto.done
    assert.ok(auto.traceId.length > 0)
    assert.equal(fake.lastTraceId(), auto.traceId)

    const explicit = aiStream(fake.url, {}, { traceId: '9f3a' })
    await explicit.done
    assert.equal(fake.lastTraceId(), '9f3a')
  })

  it('HTTP 非 200 → onError（错误即值）', async () => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    servers.push({ url: `http://127.0.0.1:${port}/x`, close: () => new Promise((r) => server.close(() => r())), lastTraceId: () => null })

    const errors: string[] = []
    const handle = aiStream(`http://127.0.0.1:${port}/x`, {}, { onError: (e) => errors.push(e.code) })
    await handle.done
    assert.deepEqual(errors, ['auth_failed'])
  })

  it('abort：中途取消 → done resolve，不再分发', async () => {
    const server: Server = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write(ev('wf:message_start', { id: 'x' }))
      res.write(ev('wf:token', { text: 'a' }))
      // 不结束，等待客户端断开
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    servers.push({ url: `http://127.0.0.1:${port}/x`, close: () => new Promise((r) => server.close(() => r())), lastTraceId: () => null })

    const tokens: string[] = []
    const handle = aiStream(`http://127.0.0.1:${port}/x`, {}, { onToken: (t) => tokens.push(t) })
    await new Promise((r) => setTimeout(r, 50))   // 等收到第一个 token
    handle.abort()
    await handle.done
    assert.equal(tokens.length >= 1, true)
    assert.equal(handle.done instanceof Promise, true)
  })
})
