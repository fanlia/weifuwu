/**
 * hooks/chat — AI 对话会话（useChat）
 *
 * 会话语义 + 工具调用内嵌 + HITL 审批。返回组件同一个 $（缓存复用）。
 */

import type { HookEnv } from './types.ts'
import type { UseChatHandle, UseChatOptions, UseChatState } from '../use-chat.ts'
import { createChatSession } from '../use-chat.ts'
import { aiStream } from '../ai.ts'

/** AI 对话会话（会话语义 + 工具调用内嵌 + HITL 审批） */
export function useChat(env: HookEnv, options: UseChatOptions): UseChatHandle {
  const state = env.$() as UseChatState
  const api = createChatSession(state, aiStream, options)
  Object.assign(state, {
    send: api.send,
    stop: api.stop,
    retry: api.retry,
    clear: api.clear,
    approve: api.approve,
    dispose: api.dispose,
  })
  // 自动 dispose：组件卸载时中止 in-flight 流，防泄漏
  const selfId = env.selfId()
  if (selfId) {
    const unsub = env.onUnmount((id) => {
      if (id === selfId) { api.dispose(); unsub() }
    })
  }
  return state as unknown as UseChatHandle
}
