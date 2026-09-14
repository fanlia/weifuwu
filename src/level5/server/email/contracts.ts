/**
 * weifuwu/email — 邮件契约层（接口与实现分离）
 *
 * 消费方（ctx.email / 业务模块）只依赖 Mailer 接口，
 * 自研引擎（src/email/index.ts 中间件 + smtp.ts 自研 SMTP 客户端）实现它。
 *
 * 裁剪声明（诚实裁剪——CS-05）：
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
 * 邮件接口（ctx.email）：统一 send 接口——适配器抽象底层服务商。
 * 适配器在中间件构造时解析（配置错误尽早暴露）——API / 自定义函数。
 */
export interface EmailInterface {
  send(msg: EmailMessage): Promise<EmailResult>
}

/** 兼容别名（= EmailInterface——对齐 Ai/AIInterface 命名） */
export type Mailer = EmailInterface

/** 统一校验层（所有实现共享——API/MemoryEmail 同一语义）：
 *  to 必填非空（零收件人发送=语义错误）；From/To CRLF 注入拒绝（header 注入） */
export function validateMessage(msg: EmailMessage): void {
  const to = Array.isArray(msg.to) ? msg.to : [msg.to]
  if (!to.length || to.some((t) => !t.trim())) {
    throw new Error('email: msg.to 必须是非空收件人列表')
  }
  if (/[\r\n]/.test(msg.from ?? '') || to.some((t) => /[\r\n]/.test(t))) {
    throw new Error('email: invalid header value (CR/LF not allowed)')
  }
}
