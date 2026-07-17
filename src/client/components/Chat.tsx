/**
 * Chat — 消息聊天组件
 *
 * 与 weifuwu 后端 messager + agent 模块对接。
 * 使用纯 JSX 编写，展示 weifuwu/client 组件最佳实践。
 *
 * ```tsx
 * import { Chat } from 'weifuwu/client'
 *
 * function ChatPage(_, ctx) {
 *   return <Chat conversationId="123" />
 * }
 * ```
 */

import { signal, effect } from '../signal.ts'
import { Show, For, onCleanup } from '../jsx-runtime.ts'
import type { Component } from '../jsx-runtime.ts'
import type { WfuiContext } from '../types.ts'

interface ChatMessage {
  id: string
  sender_id: string
  sender_name?: string
  body: string
  created_at: string
}

export const Chat: Component<{ conversationId: string }> = ({ conversationId }, ctx: WfuiContext) => {
  const messages = signal<ChatMessage[]>([])
  const input = signal('')
  const loading = signal(true)
  const isEmpty = signal(false)

  // 加载消息
  ctx.api.get(`/api/conversations/${conversationId}/messages`).then((msgs: any) => {
    messages.value = Array.isArray(msgs) ? msgs.reverse() : []
    loading.value = false
    isEmpty.value = messages.value.length === 0
  }).catch(() => {
    loading.value = false
    isEmpty.value = true
  })

  // WebSocket 实时消息 — 组件卸载时自动取消订阅
  const unsub = ctx.ws.onMessage((data: any) => {
    if (data.conversation_id === conversationId) {
      messages.value = [...messages.value, data]
      isEmpty.value = false
    }
  })
  onCleanup(() => unsub())

  const send = () => {
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    ctx.api.post('/api/messages', { conversationId, body: text }).catch(() => {})
  }

  return (
    <div class="wefu-chat">
      {/* 消息列表 */}
      <div class="wefu-chat-messages">
        <Show when={loading}>
          <div class="wefu-chat-loading">加载中...</div>
        </Show>
        <Show when={isEmpty}>
          <div class="wefu-chat-empty">暂无消息</div>
        </Show>
        <div class="wefu-chat-list">
          <For each={messages} keyBy="id">
            {(msg: ChatMessage) => (
              <div class={`wefu-chat-msg ${msg.sender_id === ctx.user?.id ? 'mine' : ''}`}>
                <div class="wefu-chat-msg-header">
                  <span class="wefu-chat-msg-sender">{msg.sender_name ?? ''}</span>
                  <span class="wefu-chat-msg-time">{new Date(msg.created_at).toLocaleTimeString()}</span>
                </div>
                <div class="wefu-chat-msg-body">{msg.body}</div>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* 输入区 */}
      <div class="wefu-chat-input">
        <input
          value={input}
          onInput={(e: any) => input.value = e.target.value}
          onKeyDown={(e: any) => { if (e.key === 'Enter') send() }}
          placeholder="输入消息..."
        />
        <button class="wefu-btn" onClick={send}>发送</button>
      </div>
    </div>
  )
}

export default Chat
