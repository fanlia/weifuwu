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
import tls from 'node:tls'
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


// ── TLS fixture（自签——测试专用——E2 会话覆盖）──────────────
const TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDCTCCAfGgAwIBAgIUZfZcMXCC05rzTGrICFNMWVMfwnkwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDgzMTAwMzIyOFoXDTM2MDgy
ODAwMzIyOFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEA1ZkOT3JeyXU8hACUhcfZfvVS1DnORhJMSnHCcTC12Ap2
lFRypFsXnthJBm+ZSgc8ZRRQJNs9IxIoXueqQThtW2iuPNSYzk7FI3Jp8YGPI8NV
hPk934Z3swDe4wUNhfNBLNLeTX16CLDJxempNHH/b0/6/WBCFYENB4/eUSg4uN5E
oSGiwFFbuE3ISrgewU7NjHtLVfCvkDLHwIBnMjV1TKqO1N4shxuUd03poTEKExOQ
MqvHYQf81LlgZHZLINS62zjT4GHFAXOpi0H5hhP4dVM0Rm6C/k323oE9v0+8GwhT
NP6LICZrED/S/zrmdEPZAKvA7XQSMXDDMVl1CVXMowIDAQABo1MwUTAdBgNVHQ4E
FgQUBHb12eRxbvf5kYNyVHmIJiBBp2QwHwYDVR0jBBgwFoAUBHb12eRxbvf5kYNy
VHmIJiBBp2QwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAw+BF
t+Hz8OOany6Uxl6s2EifF9nIondzlzBwNhgEj4ZtSF/djeKSGwADxytECJu8LQqp
YaxUIovBxGdNTAezMtEbEJDsmjetFlq3M8zhkW1jEAlqZ8m/1iu30ng9zCrZzk73
upgrOsphgRX441JBuMLvkh7K9ZSdGI4vL4TpwnqjA1247zJ7CnL9r3oA+mjbK7ge
2hGrRt50y/XGwC0u8iQRQCK/Q7lJOWitPEt1yIxF0RGYUnW8X6rJNXY5NfOEgJSh
vFA+6s9g7llWaQs9IrQvIIru5iW0A1M4+p3+ya4YGnCMsX5peUNzVqcp+AkYzE4r
3ccKSr5yDZSEohm2MQ==
-----END CERTIFICATE-----`
const TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDVmQ5Pcl7JdTyE
AJSFx9l+9VLUOc5GEkxKccJxMLXYCnaUVHKkWxee2EkGb5lKBzxlFFAk2z0jEihe
56pBOG1baK481JjOTsUjcmnxgY8jw1WE+T3fhnezAN7jBQ2F80Es0t5NfXoIsMnF
6ak0cf9vT/r9YEIVgQ0Hj95RKDi43kShIaLAUVu4TchKuB7BTs2Me0tV8K+QMsfA
gGcyNXVMqo7U3iyHG5R3TemhMQoTE5Ayq8dhB/zUuWBkdksg1LrbONPgYcUBc6mL
QfmGE/h1UzRGboL+TfbegT2/T7wbCFM0/osgJmsQP9L/OuZ0Q9kAq8DtdBIxcMMx
WXUJVcyjAgMBAAECggEASY6I4BEp1US7T1YHz75QBymimZVClNzuSuC8LlCw/rIz
vccLJ9B65Ofk1gOOjXDKeqCxLNAXUMGLB4vOFOHCvyzge/BWow17VEatd06/pXg6
Ni3DAfwDsrBFEXcG/i8ULcR8a8EfSmjfQ3nBHF95sLKhY6pHd7JWc1k3HUm1puu7
CuPS2QCqNq7QMgE7XKpynsDZhc2T4f+MWAJ/m7d9KYh0cysb9EAjMyHEqug7KSNX
sdhpfCpU52WwrIuaZB/5OvMoEy0Dbv0/a4vKXKSQGrSpl6mioTf7I5XtALFLAcAc
N4X+Zcw7wZ5lfdqagTMkkD3KCziwxVGhazRBXP2kgQKBgQD0xdj1G8LedGK4MVbi
QKVlRGvEXDehjsaz7LW576iVqYbnfCq6qW4VhnUeSNxD1BE3mrPW1q857NTrXlCc
6yMuWos0VJYq0efbLiXC21DHyE8hBEHNu4cjKWaP96CK7n7UmRM2QHiUdsrkXDgG
P6rPadalQ5CkwWa4VmKh05bMQQKBgQDfZSXtJJFbTOmz/wClh0yvvXSOYANJbMpB
IuB4lKZXCInjZoteXP2MsmGgik88/eIiRRhsFO0XxvT7qaRWSxURd1DcJd2+gYaJ
zxraekWjLiiVvp20INH2NNZAUCjtsasgfTM2hbMEB6EoQZ6FMQdcsed4GPksDnk9
oOFhXm7v4wKBgQDoGL6b1IIYK+X74BURntj2SEWjwQmjMN4rd9XthFmn6EMaNvvR
WZ0f3gop+E6cJndY8WF74r/uvio7MIhh8vi+GG8M5PQrkDQ4+e4mcY2MktytYvr+
mMYQSk6NTvI1Kuaqsqer9sAfjvDeTq91BWPzHtnAhWufPiAnxQnrhtXjwQKBgFYu
jGIfQGBrnKFPGC3Ds6b8vPGMQthZuvFEBjsehcl/xspOrieaUkqsKpOnqAgMnefA
pjpUHF+W5r4L5RVRY/BYCn7TsOckywVxO5fboe/hB9E1N1vdaYLFQX6QLin859rh
0hcPn09Hrjl8jy4tCv0MuRKQ99eyQb2vyiMpLj0nAoGASW9JBgZXrtk8XGT84F9b
4yj86X+HIvrVVIGVoB+KrD+oLRi+TMedK4iWNO87DCiD2tMKG5XFPepsc8UfFShd
uMmH0tgYGPtwfIJsSQVokyTOZSVcfYJXuj1f23Y7iIFws2Qz+mHDGiqonH0nx1Es
GdEGr4/JfFyxN2YCi+PdZ1s=
-----END PRIVATE KEY-----`

/** ── mock TLS SMTP 服务器（默认：完整会话；resetAfterUpgrade：升级后 RST）── */
async function mockTlsSmtpServer(opts?: { resetAfterUpgrade?: boolean }) {
  const lines: string[] = []
  const server = net.createServer((socket) => {
    socket.write('220 mock ESMTP\r\n')
    let buf = ''
    let tlsSock: tls.TLSSocket | null = null
    const respond = (sock: net.Socket | tls.TLSSocket, line: string) => {
      if (line.startsWith('EHLO') && !tlsSock) sock.write('250-mock\r\n250-STARTTLS\r\n250 8BITMIME\r\n')
      else if (line.startsWith('STARTTLS') && !tlsSock) {
        socket.write('220 ready\r\n')
        tlsSock = new tls.TLSSocket(socket, {
          isServer: true,
          secureContext: tls.createSecureContext({ key: TLS_KEY, cert: TLS_CERT }),
        })
        tlsSock.on('error', () => {})
        tlsSock.on('data', (chunk) => {
          // TLS 后（加密流）——逐 CRLF 解析
          const tlsLines = chunk.toString('utf8')
          let tlsBuf = ''
          tlsBuf += tlsLines
          while (true) {
            const nl = tlsBuf.indexOf('\r\n')
            if (nl === -1) return
            const l = tlsBuf.slice(0, nl)
            tlsBuf = tlsBuf.slice(nl + 2)
            lines.push(l)
            if (opts?.resetAfterUpgrade) { socket.destroy(); return }
            if (l.startsWith('EHLO')) tlsSock?.write('250-mock-tls\r\n250 8BITMIME\r\n')
            else if (l.startsWith('AUTH')) tlsSock?.write('235 2.7.0 ok\r\n')
            else if (l.startsWith('MAIL')) tlsSock?.write('250 2.1.0 ok\r\n')
            else if (l.startsWith('RCPT')) tlsSock?.write('250 2.1.5 ok\r\n')
            else if (l === 'DATA') tlsSock?.write('354 go ahead\r\n')
            else if (l === '.') tlsSock?.write('250 2.0.0 queued\r\n')
            else if (l.startsWith('QUIT')) { tlsSock?.write('221 bye\r\n'); tlsSock?.end() }
          }
        })
      }
      else if (line.startsWith('AUTH')) sock.write('235 2.7.0 ok\r\n')
      else if (line.startsWith('MAIL FROM')) sock.write('250 2.1.0 ok\r\n')
      else if (line.startsWith('RCPT TO')) sock.write('250 2.1.5 ok\r\n')
      else if (line === 'DATA') sock.write('354 go ahead\r\n')
      else if (line === '.') sock.write('250 2.0.0 queued\r\n')
      else if (line.startsWith('QUIT')) { sock.write('221 bye\r\n'); sock.end() }
    }
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      while (true) {
        const nl = buf.indexOf('\r\n')
        if (nl === -1) return
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 2)
        lines.push(line)
        respond(socket, line)
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const addr = server.address() as net.AddressInfo
  return {
    port: addr.port,
    lines,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}

describe('email — E1 header 注入（安全）', () => {
  const servers: Array<{ close: () => Promise<void> }> = []
  after(async () => { await Promise.all(servers.map((s) => s.close())) })

  it('T1 to 含 CRLF → 拒绝（旧代码：Bcc 注入成功）', async () => {
    const m = await mockSmtpServer()
    servers.push(m)
    await assert.rejects(
      sendSmtp(
        { host: '127.0.0.1', port: m.port },
        { from: 'a@x.com', to: ['a@x.com\r\nBcc: victim@evil.com'], subject: 'Hi' },
      ),
      /CR\/LF/,
    )
    assert.ok(!m.lines.some((l) => l.startsWith('Bcc')), '无注入头进入会话（旧代码注入成功——实证）')
  })

  it('T2 from 含 CRLF → 拒绝（对称防御）', async () => {
    const m = await mockSmtpServer()
    servers.push(m)
    await assert.rejects(
      sendSmtp(
        { host: '127.0.0.1', port: m.port },
        { from: 'a@x.com\r\nBcc: v@e.com', to: ['b@x.com'], subject: 'Hi' },
      ),
      /CR\/LF/,
    )
  })

  it('T3 subject 含 CRLF → encodeWord 保护（非 ASCII base64——无注入无抛错）', async () => {
    const m = await mockSmtpServer()
    servers.push(m)
    await sendSmtp(
      { host: '127.0.0.1', port: m.port },
      { from: 'a@x.com', to: ['b@x.com'], subject: 'x\r\nBcc: y' },
    )
    const subject = m.lines.find((l) => l.startsWith('Subject:'))!
    assert.ok(subject.includes('=?UTF-8?B?'), 'subject 走 encoded-word——CRLF 被 base64 化')
    assert.ok(!m.lines.some((l) => l.startsWith('Bcc')), '无注入头')
  })
})

describe('email — E2 TLS 会话', () => {
  const servers: Array<{ close: () => Promise<void> }> = []
  after(async () => { await Promise.all(servers.map((s) => s.close())) })

  it('T4 升级完成后服务器中断 → 快速 reject（旧代码挂至总 timeout）', async () => {
    const m = await mockTlsSmtpServer({ resetAfterUpgrade: true })
    servers.push(m)
    const t0 = Date.now()
    await assert.rejects(
      sendSmtp(
        { host: '127.0.0.1', port: m.port, timeoutMs: 5000 },
        { from: 'a@x.com', to: ['b@x.com'], subject: 'Hi' },
      ),
      (e: unknown) => {
        // 任何 reject 都算及时失败（旧代码：挂起至 5s timeout 且可能无 error 事件）
        return true
      },
    )
    assert.ok(Date.now() - t0 < 3000, `升级后中断 <3s 失败（实际 ${Date.now() - t0}ms——旧代码挂至 timeout）`)
  })

  it('T5 完整 TLS 会话：升级 → 重 EHLO → AUTH → MAIL → RCPT → DATA → QUIT', async () => {
    const m = await mockTlsSmtpServer()
    servers.push(m)
    await sendSmtp(
      { host: '127.0.0.1', port: m.port, user: 'u', pass: 'p' },
      { from: 'a@x.com', to: ['b@x.com'], subject: 'Hi', text: 'tls body' },
    )
    assert.ok(m.lines.includes('STARTTLS'), '尝试 STARTTLS')
    assert.ok(m.lines.some((l) => l.startsWith('AUTH PLAIN')), 'TLS 后认证')
    assert.ok(m.lines.includes('MAIL FROM:<a@x.com>'), 'TLS 后发信')
    assert.ok(m.lines.includes('QUIT'), 'QUIT')
  })
})

describe('email — E3/E5 超时与校验', () => {
  it('T7 to: [] → 明确抛错（旧代码：SMTP 零 RCPT 发信）', async () => {
    const mw = email({ from: 'a@x.com', adapter: async () => ({ accepted: true }) })
    const ctxEmail = await callEmailMiddleware(mw)
    await assert.rejects(() => ctxEmail.send({ to: [], subject: 'S' }), /非空收件人/)
  })

  it('T8 resend 挂起 → 超时 502（旧代码：无限挂）', async () => {
    // provider 故意不响应——abort 生效
    const server = http.createServer(async (req, res) => { /* 故意不响应 */ })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    const port = (server.address() as net.AddressInfo).port
    const mw = email({
      from: 'a@x.com',
      adapter: 'resend',
      resend: { apiKey: 'k', baseUrl: `http://127.0.0.1:${port}` },
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
