/**
 * weifuwu/email — 邮件契约层（接口与实现分离）
 *
 * 消费方（ctx.email / 业务模块）只依赖 Mailer 接口，
 * 自研引擎（src/email/index.ts 中间件 + smtp.ts 自研 SMTP 客户端）实现它。
 *
 * 裁剪声明（诚实裁剪——AGENTS.md CS-05）：
 *   ✅ 统一 send 接口 / text + html / 多收件人 / 自定义适配器
 *   ❌ 附件（SMTP MIME multipart 未实现）、退信/送达率（服务商职责）、
 *      批量营销、隐式入队（文档给"发邮件 = ctx.queue.add"示例）
 */
export interface EmailMessage {
  /** 收件人（可多个） */
  to: string | string[]
  subject: string
  text?: string
  html?: string
  /** 覆盖全局 from（可选） */
  from?: string
}

export interface EmailResult {
  /** 服务商返回的邮件 ID（有则给） */
  id?: string
  accepted: boolean
}

/**
 * 邮件客户端（ctx.email）：统一 send 接口，适配器抽象底层服务商。
 * 适配器在中间件构造时解析（配置错误尽早暴露）——resend / smtp / 自定义函数。
 */
export interface Mailer {
  send(msg: EmailMessage): Promise<EmailResult>
}
