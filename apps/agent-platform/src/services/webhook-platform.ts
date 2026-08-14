/**
 * 外部 IM 平台出站消息格式化 — 商业化 G8（企微/钉钉/飞书群机器人）
 *
 * 入站（外部 POST → 平台）已由 webhook.ts 支持（HMAC 签名 + 多轮 conversation_id）。
 * 出站（AI 回复 → 外部 IM 群）：各平台群机器人 webhook 消息体格式不同——
 * 平台无关的 deliverOutbound 需按平台转换（本文件 = 单一格式源）。
 */

export type OutboundPlatform = 'generic' | 'wecom' | 'dingtalk' | 'feishu'

/** 各平台文本长度上限（超出截断 + 省略号） */
const LIMITS: Record<string, number> = { wecom: 2048, dingtalk: 20000, feishu: 150000, generic: 100000 }

/**
 * 按平台格式化出站消息体（JSON 字符串）
 * - generic：{ reply, conversation_id, timestamp }（平台自解析）
 * - wecom/dingtalk：{ msgtype: 'text', text: { content } }
 * - feishu：{ msg_type: 'text', content: { text } }
 */
export function formatOutboundBody(platform: string, reply: string, conversationId?: string): string {
  const limit = LIMITS[platform] ?? LIMITS.generic
  const content = reply.length > limit ? reply.slice(0, limit - 1) + '…' : reply

  switch (platform) {
    case 'wecom':
      return JSON.stringify({ msgtype: 'text', text: { content } })
    case 'dingtalk':
      return JSON.stringify({ msgtype: 'text', text: { content } })
    case 'feishu':
      return JSON.stringify({ msg_type: 'text', content: { text: content } })
    default:
      return JSON.stringify({ reply: content, conversation_id: conversationId ?? null, timestamp: Date.now() })
  }
}
