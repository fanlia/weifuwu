/**
 * ctx.ui.useChat — AI 会话语义层（client）
 *
 * 在 aiStream（传输解码）之上加一层「一段对话」的语义：
 * 消息累积、工具调用内嵌、HITL 审批、错误恢复、stop/retry/clear。
 *
 * - 协议透明：消费 wf: 事件（design/ai-contract.md），页面不需要知道事件名
 * - 状态即 $：useChat 返回组件同一个响应式 Proxy，赋值自动渲染
 * - 就地累积：token 经 state.messages[idx] 代理就地 append（O(1)/token，
 *   不重建数组；配合 key 稳定引用 → VDOM 只 patch 文本节点）
 * - 工具内嵌：wf:tool_call/progress/result 按 toolCallId/id 聚合到
 *   消息的 toolCalls[]，ToolCallCard 直接消费（call/progress/result）
 * - 审批：approval 挂消息，approve() POST approveUrl（协议 §4.5）
 * - 生命周期：dispose() 中止流（组件 ref cleanup 调用；卸载防泄漏）
 *
 * 核心与框架无关：transport 注入（默认 aiStream），node 直接测。
 */

import type { AiStreamCallbacks, AiStreamHandle } from './ai.ts'
import type {
  ChatMessage,
  WfApprovalDecision,
  WfApprovalRequest,
  WfError,
  WfStep,
  WfToolCall,
  WfToolProgress,
  WfToolResult,
  WfUsage,
} from '../ai/types.ts'

// ── 类型 ─────────────────────────────────────────────────

/** 工具调用显示条目：ToolCallCard 的三个 props 聚合 + 状态机 */
export interface UiToolCall {
  call: WfToolCall
  progress?: WfToolProgress
  result?: WfToolResult
  status: 'running' | 'ok' | 'error'
}

/** 对话消息（显示模型）：provider 形状 + UI 状态字段 */
export interface UiMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** thinking 模式推理过程（wf:done 下发后挂上，ReasoningBlock 展示） */
  reasoning?: string
  status: 'streaming' | 'done' | 'error'
  usage?: WfUsage
  toolCalls?: UiToolCall[]
  approval?: WfApprovalRequest
  error?: WfError
}

/** useChat 会话状态（挂在 $ 上，赋值自动渲染） */
export interface UseChatState {
  messages: UiMessage[]
  input: string
  streaming: boolean
  error: WfError | null
  usage: WfUsage | null
  /** 最近 wf:step（思考/工具指示），done/error 时清空 */
  step: WfStep | null
  /** 页面自有状态与 chat 状态共处一个 $（与 ctx.ui.$() 一致） */
  [key: string]: any
}

/** useChat 操作（挂到 $ 上的方法；调用不触发渲染，内部 set 触发） */
export interface ChatApi {
  /** 发送当前输入：追加 user + assistant 占位 → POST url */
  send: () => void
  /** 中止当前流；空占位移除，有内容则标记 done */
  stop: () => void
  /** 截断到最后一条 user 消息并重新生成其回复（错误恢复） */
  retry: () => void
  /** 清空会话并中止 */
  clear: () => void
  /** 响应 HITL 审批（协议 §4.5）：清卡片 + POST approveUrl；modified 决策带修改后参数 */
  approve: (decision: WfApprovalDecision, note?: string, modifiedArgs?: Record<string, unknown>) => Promise<void>
  /** 中止流并释放（组件卸载时调用） */
  dispose: () => void
  /** 内部：订阅会话状态变更（AiChat 等共享 $ 的子组件用；返回退订）。
   *  父组件 dirty 只驱动自身重渲染，共享 handle 的子组件需自行订阅。 */
  __watch?: (cb: () => void) => () => void
}

export type UseChatHandle = UseChatState & ChatApi

export interface UseChatOptions {
  /** POST 端点（返回 wf: SSE 流） */
  url: string
  /** HITL 审批上行端点（协议 §4.5）；缺省时 approve() 只清卡片不请求 */
  approveUrl?: string
  /** 历史会话种子（app 数据注入；hook 不持有持久化） */
  initialMessages?: UiMessage[]
  /** 定制请求体（agent 模式携带 tools/mode 等）；缺省 { messages } */
  body?: (messages: UiMessage[]) => unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /** x:* 自定义事件透传（协议 §6） */
  onEvent?: (name: string, data: unknown) => void
}

/** 传输层（默认 aiStream）：POST + SSE 解析 + abort */
export type ChatTransport = (
  url: string,
  body: unknown,
  callbacks: AiStreamCallbacks,
  opts?: { signal?: AbortSignal; headers?: Record<string, string> },
) => AiStreamHandle

// ── 工具 ─────────────────────────────────────────────────

/** UiMessage[] → provider ChatMessage[]（剥离 UI 字段；reasoning 回传——thinking 模式闭环） */
export function toChatMessages(msgs: UiMessage[]): ChatMessage[] {
  return msgs.map((m) => {
    const out: ChatMessage = { role: m.role, content: m.content }
    if (m.reasoning) out.reasoning_content = m.reasoning
    return out
  })
}

function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// ── 会话状态机（transport 注入，node 可测）────────────────

export function createChatSession(state: UseChatState, transport: ChatTransport, options: UseChatOptions): ChatApi {
  // ── 初始化（确定性；组件挂载期赋值不触发渲染）──
  if (options.initialMessages) {
    state.messages = structuredClone(options.initialMessages)
  } else if (state.messages === undefined) state.messages = []
  if (state.input === undefined) state.input = ''
  if (state.streaming === undefined) state.streaming = false
  if (state.error === undefined) state.error = null
  if (state.usage === undefined) state.usage = null
  if (state.step === undefined) state.step = null

  let handle: AiStreamHandle | null = null

  /** 当前流式 assistant 消息（经代理读取 → 回调内赋值触发 dirty） */
  function current(): UiMessage | undefined {
    if (!state.streaming) return undefined
    const m = state.messages[state.messages.length - 1]
    return m && m.role === 'assistant' && m.status === 'streaming' ? m : undefined
  }

  /** 事件 → 消息内聚合（一律经代理读写，避免 raw 引用绕过 set trap） */
  function apply(name: string, data: unknown, onEvent?: (n: string, d: unknown) => void): void {
    const m = current()
    switch (name) {
      case 'wf:token':
        if (m) m.content += (data as { text: string }).text
        break
      case 'wf:tool_call': {
        if (m) {
          if (!m.toolCalls) m.toolCalls = []
          m.toolCalls.push({ call: data as WfToolCall, status: 'running' })
        }
        break
      }
      case 'wf:tool_progress': {
        const p = data as WfToolProgress
        const tc = m?.toolCalls?.find((t) => t.call.id === p.toolCallId)
        if (tc) tc.progress = p
        break
      }
      case 'wf:tool_result': {
        const r = data as WfToolResult
        const tc = m?.toolCalls?.find((t) => t.call.id === r.id)
        if (tc) {
          tc.result = r
          tc.status = r.ok ? 'ok' : 'error'
        }
        break
      }
      case 'wf:approval_request':
        if (m) m.approval = data as WfApprovalRequest
        break
      case 'wf:usage':
        if (m) m.usage = data as WfUsage
        break
      case 'wf:step':
        state.step = data as WfStep
        break
      case 'wf:done':
        if (m) {
          m.status = 'done'
          m.approval = undefined // 收尾时仍挂起的审批一并清除
          const d = data as { reasoning?: string }
          if (d.reasoning) m.reasoning = d.reasoning
        }
        state.streaming = false
        state.step = null
        break
      case 'wf:error':
        if (m) {
          m.status = 'error'
          m.error = data as WfError
          m.approval = undefined
        }
        state.error = data as WfError
        state.streaming = false
        state.step = null
        break
      default:
        onEvent?.(name, data)
        break
    }
  }

  /** 发起一次流式请求（assistant 占位已就位后调用） */
  function startStream(): void {
    const body = options.body ? options.body(state.messages) : { messages: toChatMessages(state.messages) }
    handle = transport(options.url, body, {
      onToken: (t) => apply('wf:token', { text: t }),
      onToolCall: (c) => apply('wf:tool_call', c),
      onToolProgress: (p) => apply('wf:tool_progress', p),
      onToolResult: (r) => apply('wf:tool_result', r),
      onApproval: (req) => apply('wf:approval_request', req),
      onUsage: (u) => apply('wf:usage', u),
      onStep: (s) => apply('wf:step', s),
      onDone: (d) => apply('wf:done', d),
      onError: (e) => apply('wf:error', e),
      onEvent: (n, d) => apply(n, d, options.onEvent),
    }, { signal: options.signal, headers: options.headers })
    state.streaming = true
    // trace 桥（协议 §7）：后端以 X-Trace-Id 作为 message_start.id
    const m = current()
    if (m && handle?.traceId) m.id = handle.traceId
  }

  function send(): void {
    if (state.streaming) return
    const text = String(state.input ?? '').trim()
    if (!text) return
    state.input = ''
    state.error = null
    state.usage = null
    state.step = null
    state.messages.push(
      { id: uid(), role: 'user', content: text, status: 'done' },
      { id: uid(), role: 'assistant', content: '', status: 'streaming', toolCalls: [] },
    )
    startStream()
  }

  function stop(): void {
    handle?.abort()
    state.streaming = false
    state.step = null
    const m = state.messages[state.messages.length - 1]
    if (m && m.role === 'assistant' && m.status === 'streaming') {
      if (!m.content && (!m.toolCalls || m.toolCalls.length === 0)) {
        state.messages.pop() // 空占位移除（保留 user 消息）
      } else {
        m.status = 'done'
      }
    }
  }

  function retry(): void {
    if (state.streaming) return
    let idx = -1
    for (let i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === 'user') { idx = i; break }
    }
    if (idx === -1) return
    state.messages.splice(idx + 1) // 截断失败回复
    state.error = null
    state.usage = null
    state.step = null
    state.messages.push({ id: uid(), role: 'assistant', content: '', status: 'streaming', toolCalls: [] })
    startStream()
  }

  function clear(): void {
    handle?.abort()
    state.messages = []
    state.input = ''
    state.streaming = false
    state.error = null
    state.usage = null
    state.step = null
  }

  async function approve(decision: WfApprovalDecision, note?: string, modifiedArgs?: Record<string, unknown>): Promise<void> {
    // 审批可能晚于流结束仍挂起：查最后一条 assistant 消息，不依赖 streaming
    const m = state.messages[state.messages.length - 1]
    const req = m?.role === 'assistant' ? m.approval : undefined
    if (!req) return
    m!.approval = undefined // 立即清卡片（UI 响应优先）
    if (!options.approveUrl) return
    try {
      await fetch(options.approveUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        // modified 决策：带修改后参数（协议 WfApprovalResponse.modifiedArgs，后端按它执行）
        body: JSON.stringify(modifiedArgs
          ? { id: req.id, decision, note, modifiedArgs }
          : { id: req.id, decision, note }),
        signal: options.signal,
      })
    } catch (err) {
      if (options.signal?.aborted) return
      state.error = { code: 'provider_error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  function dispose(): void {
    handle?.abort()
    handle = null
  }

  return { send, stop, retry, clear, approve, dispose }
}
