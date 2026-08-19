/**
 * vdom hooks — useChat（AI 对话会话——流式消息累积）
 *
 * 设计（AGENTS §4.2——useChat 会话：消息累积/工具调用/HITL 审批——
 * handle 带 subscribe(cb)——ctx.ui.useExternal(chat) 订阅会话变化——
 * 流式事件 → notify → 订阅组件自动重渲染——高频 notify 由写者控制频率）：
 * - send(text)：用户消息 + 助手流式累积（SSE/NDJSON 行解析——fetch POST）
 * - handle 兼容 ExternalStore（state = messages getter——useExternal 消费）
 * - stop：AbortController 中断流式
 * - 消息形状：role/content/toolCalls/status/approval（HITL 审批位）
 */

import type { HookEnv } from './env.ts'
import type { ExternalStore } from '../store.ts'

/** 聊天消息（AI 会话——工具调用/HITL 审批位） */
/** 工具调用（assistant 发起——HITL 审批——ui-dom 兼容 call/progress/result 状态面） */
export interface ChatToolCall {
  id: string
  name: string
  args: unknown
  approved?: boolean
  feedback?: string
  status?: 'running' | 'ok' | 'error'
  call?: unknown
  progress?: unknown
  result?: unknown
  /** HITL 审批请求（ui-dom 兼容——AiChat 读 toolCall 级 approval） */
  approval?: import('../../../server/ai/types.ts').WfApprovalRequest
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  /** 推理过程（wf:done 后挂上——ReasoningBlock 展示——ui-dom 兼容） */
  reasoning?: string
  /** 工具调用（assistant 发起——HITL 审批） */
  toolCalls?: ChatToolCall[]
  /** 消息状态（流式中/错误） */
  status?: 'streaming' | 'error'
  /** 用量（ui-dom 兼容） */
  usage?: import('../../../server/ai/types.ts').WfUsage
  /** HITL 审批请求（ui-dom 兼容——AiChat 读消息级 approval） */
  approval?: import('../../../server/ai/types.ts').WfApprovalRequest
  /** 错误（ui-dom 兼容） */
  error?: import('../../../server/ai/types.ts').WfError
}

export interface ChatOptions {
  /** 会话端点（默认 /api/chat——POST——NDJSON 流式响应） */
  url?: string | (() => string)
  /** 系统提示（首条 system 消息） */
  system?: string
  /** 初始消息 */
  initialMessages?: ChatMessage[]
  /** 流式分块解析（默认：每行 JSON——{ content }） */
  parseChunk?: (line: string) => { content?: string; toolCalls?: ChatMessage['toolCalls'] } | null
}

/** 会话状态 */
export type ChatStatus = 'idle' | 'streaming' | 'error'

/** 会话 handle（兼容 ExternalStore——useExternal(chat) 订阅） */
export interface ChatHandle extends ExternalStore<ChatMessage[]> {
  /** 消息列表（= state——getter） */
  messages: ChatMessage[]
  /** 发送消息（用户消息 + 助手流式累积——无参用 state.input——ui-dom 兼容） */
  send(text?: string): Promise<void>
  /** 中断流式 */
  stop(): void
  /** 重试（ui-dom 兼容——AiChat onRetry——重发最后一条用户消息） */
  retry(): void
  /** 清空会话 */
  reset(): void
  /** 会话状态 */
  status: ChatStatus
  /** 输入态（ui-dom 兼容——AiChat 受控输入） */
  input: string
  setInput(v: string): void
  /** 流式中（ui-dom 兼容） */
  streaming: boolean
  /** 最近错误（ui-dom 兼容） */
  error: import('../../../server/ai/types.ts').WfError | null
  /** 用量（ui-dom 兼容——wf:usage） */
  usage: import('../../../server/ai/types.ts').WfUsage | null
  /** 最近 wf:step（思考/工具指示——done/error 清空） */
  step: import('../../../server/ai/types.ts').WfStep | null
  /** 响应 HITL 审批（协议 §4.5——ui-dom 兼容：
   *  approve(decision, note?, modifiedArgs?)——modified 决策带修改后参数） */
  approve(decision: string, note?: string, modifiedArgs?: Record<string, unknown>): Promise<void>
}

interface ChatState {
  messages: ChatMessage[]
  status: ChatStatus
  subs: Set<() => void>
  controller: AbortController | null
  seq: number
  input: string
  error: import('../../../server/ai/types.ts').WfError | null
  usage: import('../../../server/ai/types.ts').WfUsage | null
  step: import('../../../server/ai/types.ts').WfStep | null
}

let _idSeq = 0
const newId = (): string => `m${Date.now().toString(36)}${(_idSeq++).toString(36)}`

/** useChat（工厂调用——会话生命周期——订阅经 useExternal） */
export function useChat(env: HookEnv, opts: ChatOptions): ChatHandle {
  const idx = env.nextHookIndex()
  const state = env.getHookState<ChatState>(idx) ?? {
    messages: [],
    status: 'idle',
    subs: new Set(),
    controller: null,
    seq: 0,
    input: '',
    error: null,
    usage: null,
    step: null,
  }
  env.setHookState(idx, state)

  // 初始消息（首帧注入——system + initial）
  if (state.messages.length === 0) {
    const init: ChatMessage[] = []
    if (opts.system) init.push({ id: newId(), role: 'system', content: opts.system })
    if (opts.initialMessages) init.push(...opts.initialMessages)
    state.messages = init
  }

  const notify = (): void => {
    for (const cb of [...state.subs]) cb()
  }

  /** 流式行解析（默认：{ content } 累积） */
  const parseChunk = opts.parseChunk ?? ((line: string) => {
    const data = JSON.parse(line) as { content?: string; toolCalls?: ChatMessage['toolCalls'] }
    return data
  })

  const handle: ChatHandle = {
    get state() { return state.messages },
    get messages() { return state.messages },
    // **getter（读最新）**：普通属性快照会在 mount 时固化 status——
    // send/stop/reset/error 后 handle.status 永不更新——覆盖率抓出
    // （messages 已是 getter——status 必须一致）
    get status() { return state.status },
    get input() { return state.input ?? '' },
    setInput(v: string) { state.input = v },
    get streaming() { return state.status === 'streaming' },
    get error() { return state.error ?? null },
    get usage() { return state.usage ?? null },
    get step() { return state.step ?? null },

    subscribe(cb: () => void): () => void {
      state.subs.add(cb)
      return () => { state.subs.delete(cb) }
    },

    set(): void { /* 会话消息由会话管理（不外部 set） */ },

    update(): void { /* 同上 */ },

    notify,

    async send(text: string): Promise<void> {
      const url = typeof opts.url === 'function' ? opts.url() : (opts.url ?? '/api/chat')
      const userMsg: ChatMessage = { id: newId(), role: 'user', content: text }
      state.messages = [...state.messages, userMsg]
      const assistant: ChatMessage = { id: newId(), role: 'assistant', content: '', status: 'streaming' }
      state.messages = [...state.messages, assistant]
      state.status = 'streaming'
      notify()
      const controller = new AbortController()
      state.controller = controller
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ messages: state.messages.map((m) => ({ role: m.role, content: m.content })) }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) throw new Error(`[vdom] chat 请求失败 ${res.status}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const lines = buf.split('\n')
          buf = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            const chunk = parseChunk(line)
            if (!chunk) continue
            if (chunk.content) {
              assistant.content += chunk.content
              // 高频 notify 控制：每块一次（写者控制频率）
              notify()
            }
            if (chunk.toolCalls) {
              assistant.toolCalls = [...(assistant.toolCalls ?? []), ...chunk.toolCalls]
              notify()
            }
          }
        }
        assistant.status = undefined
        state.status = 'idle'
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          assistant.status = 'error'
          state.status = 'error'
        } else {
          assistant.status = undefined
          state.status = 'idle'
        }
      } finally {
        state.controller = null
        notify()
      }
    },

    stop(): void {
      state.controller?.abort()
    },

    retry(): void {
      // 重发最后一条用户消息（send 在 handle 内定义——此处经 handle 自身调用）
      const lastUser = [...state.messages].reverse().find((m) => m.role === 'user')
      if (lastUser) void handle.send(lastUser.content)
    },

    reset(): void {
      state.messages = []
      state.status = 'idle'
      notify()
    },

    async approve(decision: string, note?: string, modifiedArgs?: Record<string, unknown>): Promise<void> {
      // 决策应用到最后一个未审批工具调用（HITL——decision/note/modifiedArgs）
      let applied = false
      state.messages = state.messages.map((m) => ({
        ...m,
        toolCalls: m.toolCalls?.map((tc) => {
          if (applied || tc.approved) return tc
          applied = true
          return {
            ...tc,
            approved: decision !== 'rejected',
            feedback: note,
            // modified 决策：修改后参数挂 args
            ...(decision === 'modified' && modifiedArgs ? { args: modifiedArgs } : {}),
          }
        }),
      }))
      notify()
    },
  }

  return handle
}
