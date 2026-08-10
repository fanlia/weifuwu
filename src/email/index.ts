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

function resendAdapter(opts: NonNullable<EmailOptions['resend']>, from: string): EmailAdapter {
  const apiKey = opts.apiKey ?? process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('email: adapter "resend" requires resend.apiKey or RESEND_API_KEY')
  }
  const baseUrl = opts.baseUrl ?? 'https://api.resend.com'
  return async (msg) => {
    const res = await fetch(`${baseUrl}/emails`, {
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
    })
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
    await sendSmtp(opts, {
      from: msg.from ?? from,
      to: Array.isArray(msg.to) ? msg.to : [msg.to],
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
  const adapter: EmailAdapter =
    typeof options.adapter === 'function'
      ? options.adapter
      : options.adapter === 'smtp'
        ? smtpAdapter(options.smtp!, options.from)
        : resendAdapter(options.resend ?? {}, options.from)

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.email = {
      send: (msg: EmailMessage) => adapter(msg),
    }
    return next(req, ctx)
  }) as unknown as EmailClient

  mw.__meta = { injects: ['email'], depends: [] }

  return mw
}
