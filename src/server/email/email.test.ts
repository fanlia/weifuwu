/**
 * email — 邮件发送中间件测试
 *
 * 协议层 mock（CS-05 方式）：
 *   - Resend 适配器：本地 node:http mock API → 断言认证头/请求体/错误映射
 *   - SMTP 适配器：本地 node:net mock SMTP 服务器 → 断言完整会话字节级
 *     （EHLO/AUTH/MAIL/RCPT/DATA/dot-stuffing/QUIT）
 *   - 自定义适配器 / from 覆盖 / encoded-word / ctx 注入
 */
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import net from 'node:net'
import { email, type EmailMessage } from '../email/index.ts'
import { sendSmtp } from '../email/smtp.ts'
import { HttpError } from '../types.ts'

/** ── mock SMTP 服务器（协议层，记录收到命令） ── */
async function mockSmtpServer(opts?: { ehlo?: string }) {
  const lines: string[] = []
  const server = net.createServer((socket) => {
    socket.write('220 mock ESMTP\r\n')
    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      while (true) {
        const nl = buf.indexOf('\r\n')
        if (nl === -1) return
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 2)
        lines.push(line)
        handle(line)
      }
    })
    function handle(line: string) {
      if (line.startsWith('EHLO')) {
        socket.write(opts?.ehlo ?? '250-mock ESMTP\r\n250 8BITMIME\r\n')
      } else if (line.startsWith('STARTTLS')) {
        socket.write('502 command not implemented\r\n')
      } else if (line.startsWith('AUTH PLAIN')) {
        socket.write('235 2.7.0 ok\r\n')
      } else if (line.startsWith('MAIL FROM')) {
        socket.write('250 2.1.0 ok\r\n')
      } else if (line.startsWith('RCPT TO')) {
        socket.write('250 2.1.5 ok\r\n')
      } else if (line === 'DATA') {
        socket.write('354 go ahead\r\n')
      } else if (line === '.') {
        socket.write('250 2.0.0 queued\r\n')
      } else if (line.startsWith('QUIT')) {
        socket.write('221 bye\r\n')
        socket.end()
      }
      // DATA 内容行（含 dot-stuffed）不响应
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address() as net.AddressInfo
  return {
    port: addr.port,
    lines,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

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

  describe('SMTP 适配器（自研协议层，mock 服务器）', () => {
    it('完整会话：EHLO → AUTH → MAIL → RCPT → DATA → QUIT', async () => {
      const m = await mockSmtpServer()
      servers.push(m)
      await sendSmtp(
        { host: '127.0.0.1', port: m.port, user: 'user', pass: 'pass' },
        { from: 'a@x.com', to: ['b@x.com', 'c@x.com'], subject: 'Hi', text: 'hello body' },
      )
      // 命令序列断言
      const cmds = m.lines.filter((l) => !l.startsWith('From:') && !l.startsWith('To:') && !l.startsWith('Subject:') && !l.startsWith('Content-') && !l.startsWith('MIME-') && l !== '' && l !== 'hello body')
      assert.equal(cmds[0], 'EHLO 127.0.0.1')
      assert.equal(cmds[1], `AUTH PLAIN ${Buffer.from('\0user\0pass').toString('base64')}`)
      assert.equal(cmds[2], 'MAIL FROM:<a@x.com>')
      assert.equal(cmds[3], 'RCPT TO:<b@x.com>')
      assert.equal(cmds[4], 'RCPT TO:<c@x.com>')
      assert.equal(cmds[5], 'DATA')
      assert.equal(cmds[6], '.') // 结束标记
      assert.equal(cmds[7], 'QUIT')
    })

    it('DATA 内容：headers + body + dot-stuffing', async () => {
      const m = await mockSmtpServer()
      servers.push(m)
      await sendSmtp(
        { host: '127.0.0.1', port: m.port },
        { from: 'a@x.com', to: ['b@x.com'], subject: 'Hi', text: 'line1\n.leading dot\nline3' },
      )
      const i = m.lines.indexOf('DATA')
      const content = m.lines.slice(i + 1)
      assert.ok(content.includes('From: a@x.com'))
      assert.ok(content.includes('To: b@x.com'))
      assert.ok(content.includes('Subject: Hi'))
      assert.ok(content.includes('Content-Type: text/plain; charset=utf-8'))
      assert.ok(content.includes('line1'))
      assert.ok(content.includes('..leading dot'), '行首 . 必须 dot-stuffed 为 ..')
      assert.ok(content.includes('line3'))
      assert.ok(content.includes('.'), 'DATA 以单独 . 结束')
    })

    it('html 消息 → Content-Type: text/html', async () => {
      const m = await mockSmtpServer()
      servers.push(m)
      await sendSmtp(
        { host: '127.0.0.1', port: m.port },
        { from: 'a@x.com', to: ['b@x.com'], subject: 'Hi', html: '<h1>ok</h1>' },
      )
      const i = m.lines.indexOf('DATA')
      const content = m.lines.slice(i + 1)
      assert.ok(content.includes('Content-Type: text/html; charset=utf-8'))
      assert.ok(content.includes('<h1>ok</h1>'))
    })

    it('非 ASCII Subject → RFC2047 encoded-word', async () => {
      const m = await mockSmtpServer()
      servers.push(m)
      await sendSmtp(
        { host: '127.0.0.1', port: m.port },
        { from: 'a@x.com', to: ['b@x.com'], subject: '验证邮件' },
      )
      const i = m.lines.indexOf('DATA')
      const content = m.lines.slice(i + 1)
      const subject = content.find((l) => l.startsWith('Subject:'))!
      assert.ok(subject.startsWith('Subject: =?UTF-8?B?'))
      assert.ok(subject.endsWith('?='))
      // base64 解码后是原文
      const b64 = subject.replace('Subject: =?UTF-8?B?', '').replace('?=', '')
      assert.equal(Buffer.from(b64, 'base64').toString('utf8'), '验证邮件')
    })

    it('服务器不支持 STARTTLS → 容错继续明文（requireTls=false）', async () => {
      const m = await mockSmtpServer({ ehlo: '250-mock ESMTP\r\n250-STARTTLS\r\n250 8BITMIME\r\n' })
      servers.push(m)
      await sendSmtp(
        { host: '127.0.0.1', port: m.port },
        { from: 'a@x.com', to: ['b@x.com'], subject: 'Hi', text: 'ok' },
      )
      assert.ok(m.lines.includes('STARTTLS'), '客户端应尝试 STARTTLS')
      assert.ok(m.lines.includes('MAIL FROM:<a@x.com>'), '失败后继续明文流程')
    })

    it('requireTls=true 且服务器拒绝 → 明确抛错（诚实裁剪）', async () => {
      const m = await mockSmtpServer({ ehlo: '250-mock ESMTP\r\n250-STARTTLS\r\n250 8BITMIME\r\n' })
      servers.push(m)
      await assert.rejects(
        sendSmtp(
          { host: '127.0.0.1', port: m.port, requireTls: true },
          { from: 'a@x.com', to: ['b@x.com'], subject: 'Hi' },
        ),
        /STARTTLS/,
      )
    })

    it('服务器拒绝 MAIL FROM → 抛错', async () => {
      const server = net.createServer((socket) => {
        socket.write('220 mock ESMTP\r\n')
        let buf = ''
        socket.on('data', (chunk) => {
          buf += chunk.toString('utf8')
          while (true) {
            const nl = buf.indexOf('\r\n')
            if (nl === -1) return
            const line = buf.slice(0, nl)
            buf = buf.slice(nl + 2)
            if (line.startsWith('EHLO')) socket.write('250-mock\r\n250 8BITMIME\r\n')
            else if (line.startsWith('MAIL FROM')) socket.write('550 relay denied\r\n')
            else if (line.startsWith('QUIT')) { socket.write('221 bye\r\n'); socket.end() }
          }
        })
      })
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
      const port = (server.address() as net.AddressInfo).port
      servers.push({ close: () => new Promise<void>((r) => server.close(() => r())) })
      await assert.rejects(
        sendSmtp({ host: '127.0.0.1', port }, { from: 'a@x.com', to: ['b@x.com'], subject: 'Hi' }),
        /MAIL FROM.*550/,
      )
    })
  })

  describe('Resend 适配器（mock HTTP API）', () => {
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
        adapter: 'resend',
        resend: { apiKey: 're_test', baseUrl: `http://127.0.0.1:${m.port}` },
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
        adapter: 'resend',
        resend: { apiKey: 're_test', baseUrl: `http://127.0.0.1:${m.port}` },
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
        adapter: 'resend',
        resend: { apiKey: 'bad', baseUrl: `http://127.0.0.1:${m.port}` },
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

    it('resend 缺 apiKey → 明确抛错', () => {
      assert.throws(() => email({ from: 'a@x.com', adapter: 'resend', resend: {} }), /RESEND_API_KEY/)
    })

    it('smtp 缺 host → 明确抛错', () => {
      assert.throws(() => email({ from: 'a@x.com', adapter: 'smtp', smtp: {} as any }), /smtp.host/)
    })
  })
})
