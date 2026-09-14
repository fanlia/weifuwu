/**
 * 外部 IM 入站（G8 补强）——企微/钉钉/飞书回调解析
 * 出站格式（formatOutboundBody）已有——入站补上闭环：
 * IM 消息 → 平台回调 → 绑定部门消息流 → AI 回复 → 平台格式回显
 */

export interface ImInboundMessage {
  content: string
  sender: string
  platform: string
  /** 平台会话/群 id（回显时可能用到） */
  conversationId?: string
}

export function parseImInbound(platform: string, body: Record<string, any>): ImInboundMessage {
  switch (platform) {
    case 'wecom': {
      const msgType = String(body?.MsgType ?? '')
      if (msgType !== 'text') throw new Error(`不支持的消息类型：${msgType || 'unknown'}`)
      const content = String(body?.Content ?? '').trim()
      if (!content) throw new Error('消息内容为空')
      return { content, sender: String(body?.FromUserName ?? 'unknown'), platform }
    }
    case 'dingtalk': {
      const content = String(body?.text?.content ?? '').trim()
      if (!content) throw new Error('消息内容为空')
      return { content, sender: String(body?.senderNick ?? body?.senderStaffId ?? 'unknown'), platform, conversationId: String(body?.conversationId ?? '') }
    }
    case 'feishu': {
      const raw = String(body?.event?.message?.content ?? '')
      let content = raw
      try {
        const parsed = JSON.parse(raw)
        content = String(parsed?.text ?? raw)
      } catch { /* 非 JSON——原文 */ }
      content = content.trim()
      if (!content) throw new Error('消息内容为空')
      return {
        content,
        sender: String(body?.event?.sender?.sender_id?.open_id ?? 'unknown'),
        platform,
        conversationId: String(body?.event?.message?.message_id ?? ''),
      }
    }
    default:
      throw new Error(`不支持的 IM 平台：${platform}`)
  }
}
