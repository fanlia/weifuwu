/**
 * weifuwu/email — 邮件发送中间件
 *
 * 注入 ctx.email.send —— 统一发送接口，适配器抽象底层服务商。
 *
 * 适配器：
 *   - 'resend'（默认推荐）：一个 POST，独立开发者首选
 *   - 'smtp'：自研 SMTP 客户端（node:net + node:tls，零依赖），任意服务商/自建 Postfix
 *   - 自定义函数：`adapter: async (msg) => ...` 一行接入任意服务商
 *
 * 裁剪声明：
 *   ✅ 统一 send 接口 / text + html / 多收件人 / 自定义适配器
 *   ❌ 附件（SMTP MIME multipart 未实现）、退信/送达率（服务商职责）、
 *      批量营销、隐式入队（文档给"发邮件 = ctx.queue.add"示例）
 *
 * ```ts
 * import { email } from 'weifuwu'
 *
 * app.use(email({
 *   from: 'no-reply@your.app',
 *   adapter: 'resend',            // 或 'smtp'
 *   resend: { apiKey: process.env.RESEND_API_KEY },
 * }))
 *
 * app.post('/api/notify', async (req, ctx) => {
 *   await ctx.email.send({ to: 'user@x.com', subject: '通知', html: '<h1>hi</h1>' })
 *   return ok()
 * })
 * ```
 */

import type { Context, Handler, Middleware } from '../types.ts'
import { HttpError } from '../types.ts'
import { sendSmtp, type SmtpConfig } from './smtp.ts'
import type { Mailer, EmailMessage, EmailResult } from './contracts.ts'

/** 契约（src/email/contracts.ts 单一来源）：ctx.email 类型 = Mailer */
export type { Mailer, EmailMessage, EmailResult }

/** 适配器：输入已标准化的邮件消息，输出结果。 */
export type EmailAdapter = (msg: EmailMessage) => Promise<EmailResult>

export interface EmailOptions {
  /** 默认发件人 */
  from: string
  adapter?: 'resend' | 'smtp' | EmailAdapter
  resend?: {
    apiKey?: string
    /** 测试可注入 mock 地址 */
    baseUrl?: string
  }
  smtp?: SmtpConfig
  /** E3：resend 适配器 HTTP 超时 ms（SMTP 用 smtp.timeoutMs——默认 30s）。默认 10_000 */
  timeoutMs?: number
}

export interface EmailInjected {
  email: Mailer
}

declare module '../types.ts' {
  interface Context {
    email?: Mailer
  }
}

export interface EmailClient extends Middleware<Context, Context & EmailInjected> {}

function resendAdapter(opts: NonNullable<EmailOptions['resend']>, from: string, timeoutMs: number): EmailAdapter {
  const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('email: adapter "resend" requires resend.apiKey or RESEND_API_KEY')
  }
  const baseUrl = opts.baseUrl ?? 'https://api.resend.com'
  return async (msg) => {
    // E3：上游超时（旧代码无 signal——provider 挂起 = 请求无限挂——SMTP 有 timeoutMs 不对称）
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch(`${baseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: msg.from ?? from,
          to: Array.isArray(msg.to) ? msg.to : [msg.to],
          subject: msg.subject,
          text: msg.text,
          html: msg.html,
        }),
        signal: controller.signal,
      })
    } catch (err) {
      if (controller.signal.aborted) {
        throw new HttpError(`email: resend timeout after ${timeoutMs}ms`, 502)
      }
      throw new HttpError(`email: resend 网络错误: ${err instanceof Error ? err.message : String(err)}`, 502)
    } finally {
      clearTimeout(timer)
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const detail = (data as { message?: string })?.message
      throw new HttpError(`email: resend ${res.status}${detail ? ` ${detail}` : ''}`, 502)
    }
    return { id: (data as { id?: string })?.id, accepted: true }
  }
}

function smtpAdapter(opts: SmtpConfig, from: string): EmailAdapter {
  if (!opts.host) throw new Error('email: adapter "smtp" requires smtp.host')
  return async (msg) => {
    // E1 前置：smtp 路径的 header 值在 buildMessage 拒绝——这里早点暴露（进会话前）
    const to = Array.isArray(msg.to) ? msg.to : [msg.to]
    const fromV = msg.from ?? from
    if (/[\r\n]/.test(fromV) || to.some((t) => /[\r\n]/.test(t))) {
      throw new Error('email: invalid header value (CR/LF not allowed)')
    }
    await sendSmtp(opts, {
      from: fromV,
      to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    })
    return { accepted: true }
  }
}

export function email(options: EmailOptions): EmailClient {
  if (!options.from) throw new Error('email: options.from is required')

  // 适配器在构造时解析（配置错误尽早暴露——诚实裁剪）
  const baseAdapter: EmailAdapter =
    typeof options.adapter === 'function'
      ? options.adapter
      : options.adapter === 'smtp'
        ? smtpAdapter(options.smtp!, options.from)
        : resendAdapter(options.resend ?? {}, options.from, options.timeoutMs ?? 10_000)

  // 统一校验层（E1/E5——所有适配器受益）：
  //   E5: to 必填非空（SMTP 零 RCPT 发信 / resend 空数组——语义错误）
  //   E1: From/To CRLF 注入前置拒绝（SMTP header 注入——buildMessage 防御的提前暴露）
  const adapter: EmailAdapter = async (msg) => {
    const to = Array.isArray(msg.to) ? msg.to : [msg.to]
    if (!to.length || to.some((t) => !t.trim())) {
      throw new Error('email: msg.to 必须是非空收件人列表')
    }
    if (/[\r\n]/.test(msg.from ?? '') || to.some((t) => /[\r\n]/.test(t))) {
      throw new Error('email: invalid header value (CR/LF not allowed)')
    }
    // 校验用归一化——传给适配器的 msg 保持原形（自定义适配器可观测形状不变）
    return baseAdapter(msg)
  }

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.email = {
      send: (msg: EmailMessage) => adapter(msg),
    }
    return next(req, ctx)
  }) as unknown as EmailClient

  mw.__meta = { injects: ['email'], depends: [] }

  return mw
}
