/**
 * email — 邮件发送中间件测试
 *
 * 协议层 mock（CS-05 方式）：
 *   - Resend 适配器：本地 node:http mock API → 断言认证头/请求体/错误映射
 *   - API 适配器：mock HTTP 端点 → 断言请求形态（Resend 兼容 POST /emails）
 *     （EHLO/AUTH/MAIL/RCPT/DATA/dot-stuffing/QUIT）
 *   - 自定义适配器 / from 覆盖 / encoded-word / ctx 注入
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { email, MemoryEmail, createMemoryEmailServer, type EmailMessage } from '../email/index.ts'
import { HttpError } from '../types.ts'

/** 中间件调用 → 取 ctx.email（send 直用亦等价） */
async function callEmailMiddleware(mw: any, msg?: EmailMessage) {
  const ctx: any = {}
  await mw(new Request('http://localhost/'), ctx, async () => new Response('ok'))
  return ctx.email
}

describe('email', () => {
  const servers: Array<{ close: () => Promise<void> }> = []
  after(async () => {
    await Promise.all(servers.map((s) => s.close()))
  })

  describe('API 适配器（mock HTTP 端点）', () => {
    function mockResendServer(opts?: { status?: number; body?: unknown }) {
      return new Promise<{ port: number; reqs: Array<{ path: string; auth: string | null; body: any }>; close: () => Promise<void> }>(
        (resolve) => {
          const reqs: Array<{ path: string; auth: string | null; body: any }> = []
          const server = http.createServer(async (req, res) => {
            let body = ''
            for await (const c of req) body += c
            reqs.push({
              path: req.url ?? '',
              auth: req.headers.authorization ?? null,
              body: body ? JSON.parse(body) : null,
            })
            res.writeHead(opts?.status ?? 200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify(opts?.body ?? { id: 'em_mock' }))
          })
          server.listen(0, '127.0.0.1', () => {
            resolve({
              port: (server.address() as net.AddressInfo).port,
              reqs,
              close: () => new Promise<void>((r) => server.close(() => r())),
            })
          })
        },
      )
    }

    it('发送：POST /emails + Bearer 认证 + JSON body', async () => {
      const m = await mockResendServer()
      servers.push(m)
      const mw = email({
        from: 'no-reply@x.com',
        apiKey: 're_test',
        baseUrl: `http://127.0.0.1:${m.port}`,
      })
      const ctxEmail = await callEmailMiddleware(mw)
      const result = await ctxEmail.send({
        to: ['a@x.com', 'b@x.com'],
        subject: '欢迎',
        html: '<p>hi</p>',
      })
      assert.equal(result.id, 'em_mock')
      assert.equal(m.reqs.length, 1)
      assert.equal(m.reqs[0].path, '/emails')
      assert.equal(m.reqs[0].auth, 'Bearer re_test')
      const body = m.reqs[0].body
      assert.equal(body.from, 'no-reply@x.com')
      assert.deepEqual(body.to, ['a@x.com', 'b@x.com'])
      assert.equal(body.subject, '欢迎')
      assert.equal(body.html, '<p>hi</p>')
    })

    it('msg.from 覆盖全局 from', async () => {
      const m = await mockResendServer()
      servers.push(m)
      const mw = email({
        from: 'no-reply@x.com',
        apiKey: 're_test',
        baseUrl: `http://127.0.0.1:${m.port}`,
      })
      const ctxEmail = await callEmailMiddleware(mw)
      await ctxEmail.send({ from: 'custom@x.com', to: 'a@x.com', subject: 'S' })
      assert.equal(m.reqs[0].body.from, 'custom@x.com')
    })

    it('服务商错误 → HttpError 502', async () => {
      const m = await mockResendServer({ status: 401, body: { message: 'invalid api key' } })
      servers.push(m)
      const mw = email({
        from: 'a@x.com',
        apiKey: 'bad',
        baseUrl: `http://127.0.0.1:${m.port}`,
      })
      const ctxEmail = await callEmailMiddleware(mw)
      await assert.rejects(
        () => ctxEmail.send({ to: 'a@x.com', subject: 'S' }),
        (e: unknown) => e instanceof HttpError && (e as HttpError).status === 502,
      )
    })
  })

  describe('自定义适配器', () => {
    it('函数直接作为 adapter', async () => {
      const calls: EmailMessage[] = []
      const mw = email({
        from: 'a@x.com',
        adapter: async (msg) => {
          calls.push(msg)
          return { accepted: true }
        },
      })
      const ctxEmail = await callEmailMiddleware(mw)
      const result = await ctxEmail.send({ to: 'b@x.com', subject: 'S', text: 't' })
      assert.equal(result.accepted, true)
      assert.deepEqual(calls, [{ to: 'b@x.com', subject: 'S', text: 't' }])
    })
  })

  describe('ctx 注入', () => {
    it('中间件注入 ctx.email', async () => {
      const mw = email({
        from: 'a@x.com',
        adapter: async () => ({ accepted: true }),
      })
      const ctx: any = {}
      await mw(new Request('http://localhost/'), ctx, async () => new Response('ok'))
      assert.ok(ctx.email)
      assert.equal(typeof ctx.email.send, 'function')
    })
  })

  describe('配置约束（诚实裁剪）', () => {
    it('缺 from → 构造时明确抛错', () => {
      assert.throws(() => email({} as any), /from/)
    })

    it('无 apiKey（也无 env）→ 构造时明确抛错', () => {
      // 清 env 防污染——原值恢复
      const prev = process.env.EMAIL_API_KEY
      delete process.env.EMAIL_API_KEY
      const prev2 = process.env.RESEND_API_KEY
      delete process.env.RESEND_API_KEY
      try {
        assert.throws(() => email({ from: 'a@x.com' }), /apiKey|EMAIL_API_KEY/)
      } finally {
        if (prev !== undefined) process.env.EMAIL_API_KEY = prev
        if (prev2 !== undefined) process.env.RESEND_API_KEY = prev2
      }
    })
  })
})


// ── TLS fixture（自签——测试专用——E2 会话覆盖）──────────────
describe('email — E1/E5 校验（安全——所有路径共享）', () => {
  it('T1 to 含 CRLF → 拒绝（header 注入——校验前置适配器不调用）', async () => {
    let called = false
    const mw = email({ from: 'a@x.com', adapter: async () => { called = true; return { accepted: true } } })
    const ctxEmail = await callEmailMiddleware(mw)
    await assert.rejects(() => ctxEmail.send({ to: ['a@x.com\r\nBcc: victim@evil.com'], subject: 'Hi' }), /CR\/LF/)
    assert.equal(called, false, '校验前置——适配器不被调用')
  })

  it('T2 from 含 CRLF → 拒绝（对称防御）', async () => {
    const mw = email({ from: 'a@x.com', adapter: async () => ({ accepted: true }) })
    const ctxEmail = await callEmailMiddleware(mw)
    await assert.rejects(() => ctxEmail.send({ from: 'a@x.com\r\nBcc: v@e.com', to: ['b@x.com'], subject: 'Hi' }), /CR\/LF/)
  })

  it('T7 to: [] → 明确抛错（语义错误：零收件人）', async () => {
    const mw = email({ from: 'a@x.com', adapter: async () => ({ accepted: true }) })
    const ctxEmail = await callEmailMiddleware(mw)
    await assert.rejects(() => ctxEmail.send({ to: [], subject: 'S' }), /非空收件人/)
  })
})

describe('email — E3 超时', () => {
  it('T8 API 挂起 → 快速失败 502（旧代码：无限挂）', async () => {
    // provider 故意不响应——abort 生效
    const server = http.createServer(async () => { /* 故意不响应 */ })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as net.AddressInfo).port
    const mw = email({
      from: 'a@x.com',
      apiKey: 'k',
      baseUrl: `http://127.0.0.1:${port}`,
      timeoutMs: 150,
    })
    try {
      const ctxEmail = await callEmailMiddleware(mw)
      const t0 = Date.now()
      await assert.rejects(
        () => ctxEmail.send({ to: 'a@x.com', subject: 'S' }),
        (e: unknown) => e instanceof HttpError && (e as HttpError).status === 502,
      )
      assert.ok(Date.now() - t0 < 1500, `超时快速失败（实际 ${Date.now() - t0}ms——旧代码无限挂）`)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((r) => server.close(() => r()))
    }
  })
})

// ── MemoryEmail（参考 MemoryAi——确定性内存实现） ──

describe('MemoryEmail', () => {
  it('new MemoryEmail = 模块：send 直用 + 中间件注入 ctx.email + sent 记录', async () => {
    const m = new MemoryEmail()
    // 模块形态（同 email() 返回——send 直接可用）
    assert.equal(typeof m.send, 'function')
    const r = await m.send({ to: 'a@x.com', subject: 'S', text: 't' })
    assert.equal(r.accepted, true)
    assert.match(r.id ?? '', /memory-mail-1/)
    assert.equal(m.sent.length, 1)
    // 中间件注入
    const ctx: any = {}
    await m(new Request('http://localhost/'), ctx, async () => new Response('ok'))
    assert.equal(typeof ctx.email.send, 'function')
  })

  it('onSend 决策注入：测试对发送行为全控（同 MemoryAi.onChat）', async () => {
    const seen: EmailMessage[] = []
    const m = MemoryEmail({ onSend: async (msg) => { seen.push(msg); return { id: 'custom-1', accepted: true } } })
    const r = await m.send({ to: 'b@x.com', subject: 'Hi' })
    assert.equal(r.id, 'custom-1')
    assert.equal(seen.length, 1)
    assert.equal(seen[0].subject, 'Hi')
  })

  it('默认（无注入）：记录 + accepted——不编造上游 id 行为', async () => {
    const m = createMemoryEmailForTest()
    const r = await m.send({ to: 'c@x.com', subject: 'S' })
    assert.equal(r.accepted, true)
    assert.equal(m.sent.length, 1)
  })

  it('校验层共享：to 空 / CRLF → 拒绝（与 API 路径同一 validateMessage）', async () => {
    const m = MemoryEmail()
    await assert.rejects(() => m.send({ to: [], subject: 'S' }), /非空收件人/)
    await assert.rejects(() => m.send({ to: ['a@x.com\r\nBcc: v'], subject: 'S' }), /CR\/LF/)
  })
})

function createMemoryEmailForTest() {
  return MemoryEmail()
}

// ── MemoryEmailServer（参考 MemoryAiServer——协议替身——真实客户端零改动直连） ──

describe('MemoryEmailServer', () => {
  it('真实 email() 客户端零改动直连：POST /emails → 收件箱断言', async () => {
    const srv = await createMemoryEmailServer()
    try {
      const mw = email({ from: 'no-reply@x.com', apiKey: 'k', baseUrl: srv.url })
      const ctxEmail = await callEmailMiddleware(mw)
      const r = await ctxEmail.send({ to: 'user@x.com', subject: '欢迎', html: '<b>hi</b>' })
      assert.match(r.id ?? '', /memory-mail-1/)
      assert.equal(srv.emails.length, 1)
      assert.deepEqual(srv.emails[0].to, ['user@x.com'])
      // HTTP 收件箱视图
      const inbox = await fetch(`${srv.url}/emails`).then((x) => x.json()) as { messages: EmailMessage[] }
      assert.equal(inbox.messages.length, 1)
      assert.equal(inbox.messages[0].subject, '欢迎')
    } finally {
      await srv.close()
    }
  })

  it('onSend 注入（测试全控决策）+ 未知路径 404', async () => {
    const srv = await createMemoryEmailServer({ onSend: async () => ({ id: 'injected', accepted: true }) })
    try {
      const mw = email({ from: 'a@x.com', apiKey: 'k', baseUrl: srv.url })
      const ctxEmail = await callEmailMiddleware(mw)
      const r = await ctxEmail.send({ to: 'b@x.com', subject: 'S' })
      assert.equal(r.id, 'injected')
      const notFound = await fetch(`${srv.url}/nope`)
      assert.equal(notFound.status, 404)
    } finally {
      await srv.close()
    }
  })

  it('validateMessage 拒绝 → 协议替身 400（同真实上游语义）', async () => {
    const srv = await createMemoryEmailServer()
    try {
      const mw = email({ from: 'a@x.com', apiKey: 'k', baseUrl: srv.url })
      const ctxEmail = await callEmailMiddleware(mw)
      await assert.rejects(() => ctxEmail.send({ to: [], subject: 'S' }), /非空收件人/)
      assert.equal(srv.emails.length, 0, '校验前置——不发请求')
    } finally {
      await srv.close()
    }
  })
})
