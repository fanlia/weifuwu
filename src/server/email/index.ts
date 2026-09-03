/**
 * weifuwu/email — 邮件发送中间件（模块：app.use 注入 ctx.email + send 直接可用）
 *
 * 发送通道 = **HTTP API（Resend 兼容端点——POST /emails）——不再直连 SMTP**。
 * 适配器：
 *   - 默认 'api'：createEmailApi（apiKey/baseUrl——EMAIL_API_KEY/EMAIL_API_URL env）
 *   - 自定义函数：`adapter: async (msg) => ...` 一行接入任意服务商
 *   - MemoryEmail / MemoryEmailServer：测试/离线（主包导出——同 ai 模块模式）
 *
 * ```ts
 * import { email } from 'weifuwu'
 *
 * app.use(email({ from: 'no-reply@your.app' }))   // read EMAIL_API_KEY/EMAIL_API_URL
 *
 * app.post('/api/notify', async (req, ctx) => {
 *   await ctx.email.send({ to: 'user@x.com', subject: '通知', html: '<h1>hi</h1>' })
 *   return ok()
 * })
 * ```
 */

import type { Context, Handler, Middleware } from '../types.ts'
import { createEmailApi } from './api.ts'
import { validateMessage, type EmailInterface, type EmailMessage, type EmailResult } from './contracts.ts'

/** 契约（contracts.ts 单一来源） */
export type { EmailInterface, Mailer, EmailMessage, EmailResult } from './contracts.ts'
export { validateMessage } from './contracts.ts'
export { createEmailApi, type EmailApiClient, type EmailApiOptions } from './api.ts'
export { MemoryEmail, createMemoryEmail, type MemoryEmailOptions } from './memory-email.ts'
export { MemoryEmailServer, createMemoryEmailServer, type MemoryEmailServerHandle, type MemoryEmailServerOptions } from './memory-email-server.ts'

/** 适配器：输入已标准化的邮件消息，输出结果。 */
export type EmailAdapter = (msg: EmailMessage) => Promise<EmailResult>

export interface EmailOptions {
  /** 默认发件人 */
  from: string
  /** API 发送 key（默认 EMAIL_API_KEY——兼容回退 RESEND_API_KEY） */
  apiKey?: string
  /** API 发送端点（默认 EMAIL_API_URL——兼容回退 RESEND_API_URL → 'https://api.resend.com'） */
  baseUrl?: string
  /** HTTP 超时 ms。默认 10_000 */
  timeoutMs?: number
  /** 自定义适配器函数（完全替换 API 路径——如 no-op） */
  adapter?: EmailAdapter
}

export interface EmailInjected {
  email: EmailInterface
}

declare module '../types.ts' {
  interface Context {
    email?: EmailInterface
  }
}

/** 模块 = 中间件（ctx.email）+ send 直接可用（worker/测试场景） */
export interface EmailClient extends Middleware<Context, Context & EmailInjected>, EmailInterface {}

export function email(options: EmailOptions): EmailClient {
  if (!options.from) throw new Error('email: options.from is required')

  // 适配器构造时解析（配置错误尽早暴露）：自定义函数 > API provider
  const baseAdapter: EmailAdapter =
    options.adapter ?? createEmailApi({ apiKey: options.apiKey, baseUrl: options.baseUrl, timeoutMs: options.timeoutMs, from: options.from }).send

  // 统一校验层（所有路径共享——to 必填/CRLF 拒绝）
  const adapter: EmailAdapter = async (msg) => {
    validateMessage(msg)
    return baseAdapter(msg)
  }

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.email = { send: adapter }
    return next(req, ctx)
  }) as unknown as EmailClient

  mw.__meta = { injects: ['email'], depends: [] }
  ;(mw as EmailClient).send = adapter
  return mw
}
