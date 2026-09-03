/**
 * weifuwu/email — MemoryEmail（内存实现——参考 MemoryAi）
 *
 * 契约直实现 EmailClient（中间件 + send 直接可用）——确定性：
 *   - onSend 决策注入（测试对发送行为全控——同 MemoryAi.onChat）
 *   - 默认（无注入）：记录到 sent + accepted（不编造上游行为——id 为 memory-mail-N）
 *   - 复用统一校验层（validateMessage——to 必填/CRLF 注入拒绝——与 API 路径一致）
 *
 * 用途：测试（断言 sent 记录）/ 离线 dev / 无上游 key 环境。
 * 真实发送由 API provider（api.ts——HTTP 端点——不直连 SMTP）承担。
 */
import type { Context, Handler, Middleware } from '../types.ts'
import { validateMessage, type EmailInterface, type EmailMessage, type EmailResult } from './contracts.ts'

export interface MemoryEmailOptions {
  /** 决策注入（默认未注入：记录 + accepted——确定性） */
  onSend?: (msg: EmailMessage) => EmailResult | Promise<EmailResult>
}

export interface MemoryEmail extends Middleware<Context, Context & { email: EmailInterface }>, EmailInterface {
  /** 已发送记录（默认路径——断言用） */
  sent: EmailMessage[]
}

export interface MemoryEmail {
  new (options?: MemoryEmailOptions): MemoryEmail
}

/** 模块构造（new MemoryEmail() / MemoryEmail() / createMemoryEmail() 等价） */
export function MemoryEmail(options?: MemoryEmailOptions): MemoryEmail {
  const sent: EmailMessage[] = []
  const idSeq = () => `memory-mail-${sent.length}`

  const send = async (msg: EmailMessage): Promise<EmailResult> => {
    validateMessage(msg)
    sent.push(msg)
    if (options?.onSend) return options.onSend(msg)
    return { id: idSeq(), accepted: true }
  }

  const mw = (async (req: Request, ctx: Context, next: Handler) => {
    ctx.email = { send }
    return next(req, ctx)
  }) as unknown as MemoryEmail

  mw.__meta = { injects: ['email'], depends: [] }
  ;(mw as MemoryEmail).send = send
  ;(mw as MemoryEmail).sent = sent
  return mw
}

/** 工厂别名（= MemoryEmail——与 createMemorySql/createMemoryAi 命名对称） */
export const createMemoryEmail = MemoryEmail
