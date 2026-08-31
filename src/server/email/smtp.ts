/**
 * 自研 SMTP 客户端（零依赖，node:net + node:tls）
 *
 * 覆盖流程：连接 → 220 → EHLO（特性协商）→ STARTTLS（可选）→ AUTH PLAIN
 * → MAIL FROM → RCPT TO → DATA（dot-stuffing）→ QUIT。
 *
 * 诚实裁剪：
 *   - 无连接池/批处理（每次发送新建连接）
 *   - 无附件（MIME multipart 未实现，v1 只 text/html）
 *   - Subject 非 ASCII 自动 RFC2047 encoded-word（UTF-8）
 *   - AUTH 仅 PLAIN（LOGIN/CRAM-MD5 不支持——明确报错而非静默）
 */

import net from 'node:net'
import tls from 'node:tls'

export interface SmtpConfig {
  host: string
  /** 默认 465（secure=true）/ 587（secure=false） */
  port?: number
  user?: string
  pass?: string
  /** true = 直连 TLS（465）；false = 明文 + STARTTLS（587）。默认 false。 */
  secure?: boolean
  /** secure=false 时 STARTTLS 失败是否中止。默认 false（继续明文，测试/内网场景）。 */
  requireTls?: boolean
  timeoutMs?: number
  /** 自签证书/测试环境放行。默认 false。 */
  rejectUnauthorized?: boolean
}

export interface SmtpMessage {
  from: string
  to: string[]
  subject: string
  text?: string
  html?: string
}

interface SmtpResponse {
  code: number
  lines: string[]
}

/** 非 ASCII → RFC2047 encoded-word（UTF-8 base64） */
function encodeWord(s: string): string {
  if (/^[\x20-\x7e]*$/.test(s)) return s
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}

/** E1：拒绝 CR/LF 的 header 值——header 注入防御（subject 有 encodeWord 保护——
 *  From/To 裸拼接是洞口——收件人来自用户输入（邀请表单 email 等）——
 *  CRLF 注入可伪造 Bcc/Reply-To 任意头——拒绝 > 清洗（清洗有语义歧义——G9 纪律） */
function assertHeaderValue(value: string, name: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`smtp: invalid ${name} header value (CR/LF not allowed)`)
  }
}

/** 组装 RFC5322 邮件（CRLF 行结束） */
function buildMessage(msg: SmtpMessage): string {
  // E1：From/To 是 header 注入面——subject 由 encodeWord 保护——这里显式拒绝
  assertHeaderValue(msg.from, 'From')
  for (const to of msg.to) assertHeaderValue(to, 'To')
  const lines: string[] = []
  lines.push(`From: ${msg.from}`)
  lines.push(`To: ${msg.to.join(', ')}`)
  lines.push(`Subject: ${encodeWord(msg.subject)}`)
  lines.push('MIME-Version: 1.0')
  lines.push(
    msg.html ? 'Content-Type: text/html; charset=utf-8' : 'Content-Type: text/plain; charset=utf-8',
  )
  lines.push('')
  // body 换行统一 CRLF（LF 规范化，否则 dot-stuffing 按行处理失效）
  lines.push((msg.html ?? msg.text ?? '').replace(/\r?\n/g, '\r\n'))
  return lines.join('\r\n')
}

export function sendSmtp(cfg: SmtpConfig, msg: SmtpMessage): Promise<void> {
  return new Promise((resolve, reject) => {
    // E1：协议命令层前置——MAIL FROM/RCPT TO 命令直接拼接（buildMessage 的 DATA 校验
    // 太晚——命令注入发生在会话早期——实证：RCPT 命令行注入 Bcc）；入口校验 = 零会话字节
    assertHeaderValue(msg.from, 'From')
    for (const to of msg.to) assertHeaderValue(to, 'To')
    const port = cfg.port ?? (cfg.secure ? 465 : 587)
    const timeoutMs = cfg.timeoutMs ?? 30_000

    let socket: net.Socket | tls.TLSSocket | null = null
    let buf = ''
    let pending: { resolve: (r: SmtpResponse) => void; lines: string[] } | null = null

    const timer = setTimeout(() => {
      fail(new Error(`smtp: timeout after ${timeoutMs}ms (${cfg.host}:${port})`))
    }, timeoutMs)

    function fail(err: Error) {
      clearTimeout(timer)
      if (socket && !socket.destroyed) socket.destroy()
      reject(err)
    }

    function onData(chunk: Buffer) {
      buf += chunk.toString('utf8')
      while (true) {
        const nl = buf.indexOf('\r\n')
        if (nl === -1) return
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 2)
        if (!pending) continue
        // 响应最后一行：code + 空格；续行：code + 连字符
        if (line.length >= 4 && line[3] === ' ') {
          const p = pending
          pending = null
          p.resolve({ code: parseInt(line.slice(0, 3), 10), lines: p.lines })
          return
        }
        pending.lines.push(line)
      }
    }

    function exchange(cmd: string): Promise<SmtpResponse> {
      return new Promise((resolveResp, rejectResp) => {
        if (pending) {
          rejectResp(new Error('smtp: concurrent exchange'))
          return
        }
        pending = {
          resolve: (r) => (r.code >= 400 ? rejectResp(new Error(`smtp: ${cmd} → ${r.code} ${r.lines[0]}`)) : resolveResp(r)),
          lines: [],
        }
        socket?.write(cmd + '\r\n')
      })
    }

    function upgradeTls(): Promise<void> {
      return new Promise((resolveUp, rejectUp) => {
        const tlsSocket = tls.connect({
          socket: socket as net.Socket,
          rejectUnauthorized: cfg.rejectUnauthorized ?? false,
        })
        tlsSocket.once('secureConnect', () => {
          socket = tlsSocket
          tlsSocket.on('data', onData)
          // E2：TLS 会话期错误/关闭 → fail（once('error') 在 secureConnect 后已消费——
          // 旧代码升级后中断挂至总 timeout（默认 30s）——生产形态实证；
          // fail 幂等——正常完成后的 close no-op（promise 已 settle））
          tlsSocket.on('error', (e) => fail(e))
          tlsSocket.on('close', () => fail(new Error('smtp: connection closed during TLS session')))
          resolveUp()
        })
        tlsSocket.once('error', rejectUp)
      })
    }

    const run = async () => {
      try {
        // 连接（secure=true 直连 TLS）
        const raw = cfg.secure
          ? tls.connect(port, cfg.host, { rejectUnauthorized: cfg.rejectUnauthorized ?? false })
          : net.connect(port, cfg.host)
        socket = raw
        raw.on('data', onData)
        raw.on('error', (e) => fail(e))
        await new Promise<void>((r) => raw.once('connect', r))

        // 服务器 greeting（220）
        const greeting = await new Promise<SmtpResponse>((r) => {
          pending = { resolve: r, lines: [] }
        })
        if (greeting.code !== 220) throw new Error(`smtp: greeting ${greeting.code} ${greeting.lines[0]}`)

        // EHLO 特性协商
        const ehlo = await exchange(`EHLO ${cfg.host}`)
        const features = ehlo.lines.join('\n')

        // STARTTLS（明文模式下若服务器支持）
        if (!cfg.secure && /STARTTLS/i.test(features)) {
          try {
            const stls = await exchange('STARTTLS')
            if (stls.code === 220) {
              await upgradeTls()
              await exchange(`EHLO ${cfg.host}`) // TLS 后重新 EHLO
            }
          } catch (e) {
            if (cfg.requireTls) throw e
            // 服务器不支持/失败 → 按配置继续明文
          }
        }

        // AUTH PLAIN（配置了凭证才认证）
        if (cfg.user) {
          const plain = Buffer.from(`\0${cfg.user}\0${cfg.pass ?? ''}`, 'utf8').toString('base64')
          const auth = await exchange(`AUTH PLAIN ${plain}`)
          if (auth.code !== 235 && auth.code !== 250 && auth.code !== 334) {
            throw new Error(`smtp: auth failed ${auth.code}`)
          }
        }

        // MAIL FROM / RCPT TO
        await exchange(`MAIL FROM:<${msg.from}>`)
        for (const to of msg.to) {
          await exchange(`RCPT TO:<${to}>`)
        }

        // DATA（dot-stuffing：行首 . 加倍）
        const data = await exchange('DATA')
        if (data.code !== 354) throw new Error(`smtp: DATA rejected ${data.code}`)
        const body = buildMessage(msg)
        const stuffed = body
          .split('\r\n')
          .map((l) => (l.startsWith('.') ? '.' + l : l))
          .join('\r\n')
        await new Promise<void>((r, j) => {
          socket?.write(stuffed + '\r\n.\r\n', (err) => (err ? j(err) : r()))
        })
        const done = await new Promise<SmtpResponse>((r) => {
          pending = { resolve: r, lines: [] }
        })
        if (done.code !== 250) throw new Error(`smtp: message rejected ${done.code} ${done.lines[0]}`)

        // QUIT
        await exchange('QUIT').catch(() => {})
        clearTimeout(timer)
        socket.end()
        resolve()
      } catch (e) {
        fail(e instanceof Error ? e : new Error(String(e)))
      }
    }

    run()
  })
}
