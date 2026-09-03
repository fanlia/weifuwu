/**
 * weifuwu/email — API provider（Resend 兼容 HTTP 端点——POST /emails）
 *
 * 参考 AI 模块（client.ts——AiClient）：**发送走 HTTP API——不再直连 SMTP**。
 * 任意 Resend 兼容端点（Resend / 自托管网关 / MemoryEmailServer 测试替身）：
 *   配置：显式参数 > env（EMAIL_API_KEY / EMAIL_API_URL——兼容回退 RESEND_*）
 *   POST {baseUrl}/emails  Bearer {apiKey}  { from, to[], subject, text?, html? } → 200 { id }
 *   上游故障（超时/网络/4xx/5xx）→ HttpError 502（保留旧 resend 适配器语义）
 */
import { HttpError } from '../types.ts'
import type { EmailMessage, EmailResult } from './contracts.ts'

export interface EmailApiOptions {
  /** 默认 EMAIL_API_KEY（兼容回退 RESEND_API_KEY）——构造时无 key 明确 throw */
  apiKey?: string
  /** 默认 EMAIL_API_URL（兼容回退 RESEND_API_URL）→ 'https://api.resend.com' */
  baseUrl?: string
  /** HTTP 超时 ms——默认 10_000（上游挂起 → 502——不无限挂） */
  timeoutMs?: number
  /** 默认发件人 */
  from: string
}

export interface EmailApiClient {
  send(msg: EmailMessage): Promise<EmailResult>
}

export function createEmailApi(opts: EmailApiOptions): EmailApiClient {
  const apiKey = opts.apiKey ?? process.env.EMAIL_API_KEY ?? process.env.RESEND_API_KEY ?? ''
  if (!apiKey) {
    throw new Error('email: 需要 apiKey（EMAIL_API_KEY 或显式传入——不直连 SMTP）')
  }
  const baseUrl = opts.baseUrl ?? process.env.EMAIL_API_URL ?? process.env.RESEND_API_URL ?? 'https://api.resend.com'
  const timeoutMs = opts.timeoutMs ?? 10_000

  return {
    async send(msg: EmailMessage): Promise<EmailResult> {
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
            from: msg.from ?? opts.from,
            to: Array.isArray(msg.to) ? msg.to : [msg.to],
            subject: msg.subject,
            text: msg.text,
            html: msg.html,
          }),
          signal: controller.signal,
        })
      } catch (err) {
        if (controller.signal.aborted) {
          throw new HttpError(`email: 上游超时 after ${timeoutMs}ms`, 502)
        }
        throw new HttpError(`email: 网络错误: ${err instanceof Error ? err.message : String(err)}`, 502)
      } finally {
        clearTimeout(timer)
      }
      let data: { id?: string; message?: string } = {}
      try {
        data = await res.json()
      } catch {
        // 非 JSON 响应——走状态码分支
      }
      if (!res.ok) {
        throw new HttpError(`email: 上游 ${res.status}${data.message ? ` ${data.message}` : ''}`, 502)
      }
      return { id: data.id, accepted: true }
    },
  }
}
