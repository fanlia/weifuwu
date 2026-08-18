/**
 * hooks/chat — AI 对话会话（useChat）
 *
 * 会话语义 + 工具调用内嵌 + HITL 审批。render-only 方案（design 归档）：
 * state 是**普通对象**（不再挂组件 $），变化 → notify → 订阅者重渲染；
 * handle 带 subscribe——共享会话的子组件用 ctx.ui.useExternal(handle) 订阅。
 */

import type { HookEnv } from '../contracts/hooks.ts'
import type { UseChatHandle, UseChatOptions, UseChatState } from '../use-chat.ts'
import { createChatSession } from '../use-chat.ts'
import { aiStream } from '../ai.ts'

/** AI 对话会话（会话语义 + 工具调用内嵌 + HITL 审批） */
export function useChat(env: HookEnv, options: UseChatOptions): UseChatHandle {
  // 共享状态：普通对象 + 订阅表（render-only——不再挂组件 $）
  const state: UseChatState = {
    messages: [],
    input: '',
    streaming: false,
    error: null,
    usage: null,
    step: null,
  }
  const subs = new Set<() => void>()
  const notify = () => {
    for (const cb of [...subs]) cb()
  }
  const api = createChatSession(state, aiStream, options, notify)
  Object.assign(state, api)
  ;(state as any).subscribe = (cb: () => void) => {
    subs.add(cb)
    return () => {
      subs.delete(cb)
    }
  }
  // 自动 dispose：组件卸载时中止 in-flight 流，防泄漏
  const selfId = env.compId
  if (selfId) {
    const unsub = env.onUnmount(() => {
      api.dispose(); unsub()
    })
  }
  return state as unknown as UseChatHandle
}
