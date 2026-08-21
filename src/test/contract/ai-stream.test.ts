/**
 * ai-stream 契约——wf: SSE 流式解析（真实 HTTP fixture——不 mock 网络层）
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { aiStream } from '../../client/vdom/hooks/ai-stream.ts'

let server: Server
let base = ''

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    res.setHeader('content-type', 'text/event-stream')
    if (url.pathname === '/api/stream') {
      // wf: SSE 流（event/data 块——token → done）
      res.write('event: wf:token\ndata: {"text":"你"}\n\n')
      res.write('event: wf:token\ndata: {"text":"好"}\n\n')
      setTimeout(() => {
        res.write('event: wf:done\ndata: {"ok":true}\n\n')
        res.end()
      }, 20)
    } else if (url.pathname === '/api/error') {
      res.statusCode = 500
      res.end('boom')
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

test('wf: SSE 解析：token 累积 + done 回调 + events 记录', async () => {
  let text = ''
  let doneFlag = false
  const handle = aiStream(`${base}/api/stream`, { prompt: 'hi' }, {
    onToken: (t) => { text += t },
    onDone: () => { doneFlag = true },
  })
  await handle.done
  assert.equal(text, '你好', 'token 累积（{text} → content）')
  assert.equal(doneFlag, true, 'onDone 回调')
  assert.ok(handle.events.length >= 3, `events 记录（token×2 + done——实际 ${handle.events.length}`)
  assert.equal(handle.events[0].name, 'wf:token')
})

test('HTTP 错误 → onError（provider_error——非静默）', async () => {
  let err: unknown = null
  const handle = aiStream(`${base}/api/error`, {}, { onError: (e) => { err = e } })
  await handle.done
  assert.ok(err, 'onError 触发')
  assert.equal((err as { code: string }).code, 'provider_error')
})

test('abort：主动取消 → 静默返回（无 onError）', async () => {
  let err = false
  const handle = aiStream(`${base}/api/stream`, {}, { onError: () => { err = true } })
  handle.abort()
  await handle.done
  assert.equal(err, false, 'abort 后无错误回调（静默取消）')
})

test('traceId：默认生成 + events 记录（RECORD_LIMIT 环）', async () => {
  const handle = aiStream(`${base}/api/stream`, {})
  await handle.done
  assert.ok(typeof handle.traceId === 'string' && handle.traceId.length > 0, 'traceId 生成')
  assert.ok(handle.events.length <= 500, 'RECORD_LIMIT 环（500）')
})
