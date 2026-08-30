/**
 * WS handler 错误兜底契约（SERVER-PERF-PLAN S3——波次 1）
 *
 * 任意 hook（open/message/close/error）同步抛错或异步拒绝都**不逃逸进程**：
 *   - 有 error hook → 转交（应用获得感知点）
 *   - 无 error hook → console.error（审计可见——静默吞错是违例）
 * 连接与消息循环保持可用（单个 handler 失败不拖垮服务）。
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import WebSocket from 'ws'
import { serve } from './serve.ts'
import { Router } from './router.ts'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function openWS(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => ws.once('message', (d) => resolve(String(d))))
}

/** 等待 close 握手完成（fire-and-forget close 会残留客户端 socket——文件级挂起） */
function closeWS(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve()
    ws.once('close', () => resolve())
    ws.close()
  })
}

describe('ws handler error containment (S3)', () => {
  let servers: Awaited<ReturnType<typeof serve>>[] = []

  afterEach(async () => {
    for (const s of servers) await s.close()
    servers = []
  })

  function start(app: Router) {
    const s = serve(app, { port: 0, shutdown: false })
    servers.push(s)
    return s
  }

  it('async message rejection → error hook 收到错误 + 后续消息正常处理（不逃逸进程）', async () => {
    const errors: string[] = []
    const app = new Router()
    app.ws('/ws', {
      message: async (ws, ctx, data) => {
        if (String(data) === 'boom') {
          await sleep(5)
          throw new Error('boom')
        }
        ws.send('pong')
      },
      error: (ws, ctx, err) => { errors.push(err.message) },
    })
    const s = start(app)
    await s.ready

    const ws = await openWS(`ws://127.0.0.1:${s.port}/ws`)
    ws.send('boom')
    await sleep(50)
    ws.send('hello')
    assert.equal(await nextMessage(ws), 'pong', '消息循环在失败后仍可用')
    await sleep(30)
    assert.deepEqual(errors, ['boom'], '错误应转交 error hook')
    await closeWS(ws)
  })

  it('sync message throw（无 error hook）→ console.error 兜底 + 连接存活', async () => {
    const logged: string[] = []
    const orig = console.error
    console.error = (...a: unknown[]) => { logged.push(a.map(String).join(' ')) }
    try {
      const app = new Router()
      app.ws('/ws', {
        message: (ws, ctx, data) => {
          if (String(data) === 'boom') throw new Error('sync boom')
          ws.send('pong')
        },
      })
      const s = start(app)
      await s.ready

      const ws = await openWS(`ws://127.0.0.1:${s.port}/ws`)
      ws.send('boom')
      await sleep(30)
      ws.send('hello')
      assert.equal(await nextMessage(ws), 'pong', '连接在同步抛错后仍可用')
      await sleep(30)
      assert.ok(logged.some((e) => e.includes('sync boom')), '无 error hook 时 console.error 兜底（审计可见）')
      await closeWS(ws)
    } finally {
      console.error = orig
    }
  })

  it('open/close handler rejection 被兑底（连接照常建立/收发/关闭）', async () => {
    const app = new Router()
    app.ws('/ws', {
      open: async () => { throw new Error('open boom') },
      close: async () => { throw new Error('close boom') },
      message: (ws) => ws.send('ok'),
    })
    const s = start(app)
    await s.ready

    const ws = await openWS(`ws://127.0.0.1:${s.port}/ws`)
    ws.send('ping') // 服务端 message hook 由客户端消息触发
    assert.equal(await nextMessage(ws), 'ok', 'open 抛错不阻止连接建立与收发')
    await closeWS(ws)
  })
})
