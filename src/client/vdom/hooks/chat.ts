/**
 * vdom hooks — useChat（AI 对话会话——流式消息累积）
 *
 * 设计（设计规则 §4.2——useChat 会话：消息累积/工具调用/HITL 审批——
 * handle 带 subscribe(cb)——ctx.ui.useExternal(chat) 订阅会话变化——
 * 流式事件 → notify → 订阅组件自动重渲染——高频 notify 由写者控制频率）：
 * - send(text)：用户消息 + 助手流式累积（SSE/NDJSON 行解析——fetch POST）
 * - handle 兼容 ExternalStore（state = messages getter——useExternal 消费）
 * - stop：AbortController 中断流式
 * - 消息形状：role/content/toolCalls/status/approval（HITL 审批位）
 */

import type { HookEnv } from './env.ts'
import type { ExternalStore } from '../store.ts'
import { Subject } from '../observable/index.ts'

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
  /** 流式分块解析（默认：wf: SSE 协议全家桶 + 裸 JSON 行兼容）。
   *  第二参 event = 当前 SSE 事件名（wf:token 等——裸行时 undefined）。
   *  返回形状扩展：content/toolCalls 之外支持 step/usage/approval/
   *  toolProgress/toolResult/error/done（内置解析器分派消费） */
  parseChunk?: (line: string, event?: string) => ChatChunk | null
}

/** 流式分块解析结果（wf: 协议事件 → 会话状态更新的映射面） */
export interface ChatChunk {
  content?: string
  toolCalls?: ChatToolCall[]
  /** wf:step——思考/工具状态指示 */
  step?: import('../../../server/ai/types.ts').WfStep | null
  /** wf:usage——token 用量 */
  usage?: import('../../../server/ai/types.ts').WfUsage
  /** wf:approval_request——HITL 审批请求（挂当前 assistant 消息） */
  approval?: import('../../../server/ai/types.ts').WfApprovalRequest
  /** wf:tool_progress——工具进度（按 toolCallId 定位更新） */
  toolProgress?: { toolCallId: string } & Record<string, unknown>
  /** wf:tool_result——工具结果（按 id 定位更新） */
  toolResult?: { id: string; ok?: boolean; output?: unknown } & Record<string, unknown>
  /** wf:error——协议错误 */
  error?: import('../../../server/ai/types.ts').WfError
  /** wf:done——流结束（content 仅在消息为空时采纳——防 token 累积重复） */
  done?: boolean
  /** 内部标记：content 来自 done 快照（替换语义而非追加） */
  doneContent?: boolean
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
  changes: Subject<ChatMessage[]>
  controller: AbortController | null
  seq: number
  input: string
  error: import('../../../server/ai/types.ts').WfError | null
  usage: import('../../../server/ai/types.ts').WfUsage | null
  step: import('../../../server/ai/types.ts').WfStep | null
}

let _idSeq = 0
const newId = (): string => `m${Date.now().toString(36)}${(_idSeq++).toString(36)}`

/** 默认流式解析器（wf: SSE 协议状态机——2027-XX 全事件修复）
 *
 * **协议漂移（真实 bug 两段）**：① v1 只按裸 JSON 行解析——wf: SSE 的
 * data: 前缀/event 行全丢——助手气泡恒 '…'；② 本次验证再发现：token 之外
 * 的 wf:step/wf:tool_call/wf:tool_progress/wf:tool_result/wf:approval_request/
 * wf:usage/wf:done 全部被丢弃——state.step/state.usage/approval 零赋值点——
 * AiChat 的状态行/usage 行/工具卡/审批卡（展示层已支持）永远等不到数据
 * （AiChat agent 链路验证实测）。本状态机按 event 名分派全事件。
 */
function makeDefaultParser(): (line: string, event?: string) => ChatChunk | null {
  let currentEvent = ''
  return (line: string, event?: string): ChatChunk | null => {
    const trimmed = line.trim()
    if (!trimmed) return null
    if (trimmed.startsWith('event:')) {
      currentEvent = trimmed.slice(6).trim()
      return null
    }
    const ev = event ?? currentEvent
    const json = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
    if (!json) return null
    let d: any
    try {
      d = JSON.parse(json)
    } catch {
      return null
    }
    // 裸 JSON 行（无 event——旧/简单服务端兼容）
    if (!ev) {
      if (d.toolCalls) return { toolCalls: d.toolCalls as ChatToolCall[] }
      if (d.text !== undefined) return { content: String(d.text) }
      return d.content !== undefined ? { content: d.content } : null
    }
    // wf: 协议事件分派
    switch (ev) {
      case 'wf:message_start':
        return null
      case 'wf:token':
        return { content: d.text !== undefined ? String(d.text) : d.content }
      case 'wf:step':
        return { step: d }
      case 'wf:usage':
        return { usage: d }
      case 'wf:tool_call':
        return {
          toolCalls: [{
            id: d.id, name: d.name, args: d.args,
            status: 'running', call: d,
          } as ChatToolCall],
        }
      case 'wf:tool_progress':
        return { toolProgress: d }
      case 'wf:tool_result': {
        return { toolResult: d }
      }
      case 'wf:approval_request':
        return { approval: d }
      case 'wf:error':
        return { error: d }
      case 'wf:done': {
        // content 仅在消息为空时采纳（token 已累积全文快照不重复——done 语义 = 流结束）
        const rest = d.usage ? { usage: d.usage } : {}
        return { done: true, ...(d.content ? { content: d.content, doneContent: true } : {}), ...rest } as ChatChunk
      }
      default:
        return null
    }
  }
}

/** useChat（工厂调用——会话生命周期——订阅经 useExternal） */
export function useChat(env: HookEnv, opts: ChatOptions): ChatHandle {
  const idx = env.nextHookIndex()
  const state = env.getHookState<ChatState>(idx) ?? {
    messages: [],
    status: 'idle',
    subs: new Set(),
    changes: new Subject<ChatMessage[]>(),
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
    state.changes.next([...state.messages]) // 值源流视图（浅拷贝快照——原地改不污染历史）
  }

  /** 流式行解析（默认：{ content } 累积） */
  const parseChunk: (line: string, event?: string) => ChatChunk | null =
    opts.parseChunk ?? makeDefaultParser()

  const handle: ChatHandle = {
    get state() { return state.messages },
    get messages() { return state.messages },
    changes$: state.changes.asObservable(),
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

    async send(text: string = state.input): Promise<void> {
      // **默认值 bug**：接口注释「无参用 state.input」——实现漏默认值——
      // AiChat onSend 调 send()（无参）——content undefined——消息渲染
      // '…'（m.content || '…'）——body 的 content 也被 JSON.stringify 丢弃——
      // agent-browser 实测：用户消息不显示
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
          let currentEvent: string | undefined
          for (const line of lines) {
            if (!line.trim()) continue
            // event: 行 → 记录事件名（data 行消费后清）
            if (line.trim().startsWith('event:')) {
              currentEvent = line.trim().slice(6).trim()
              continue
            }
            const chunk = parseChunk(line, currentEvent)
            if (line.trim().startsWith('data:')) currentEvent = undefined
            if (!chunk) continue
            // **全事件消费（2027-XX——协议解析完整性修复）**
            if (chunk.content) {
              // done 快照替换语义（token 已累积时防重复）；流式 token 追加
              assistant.content = chunk.doneContent
                ? (assistant.content || chunk.content)
                : assistant.content + chunk.content
              notify()
            }
            if (chunk.toolCalls?.length) {
              assistant.toolCalls = [...(assistant.toolCalls ?? []), ...chunk.toolCalls]
              notify()
            }
            if (chunk.toolProgress) {
              const tc = assistant.toolCalls?.find((x) => x.id === chunk.toolProgress!.toolCallId)
              if (tc) { tc.progress = chunk.toolProgress; notify() }
            }
            if (chunk.toolResult) {
              const tc = assistant.toolCalls?.find((x) => x.id === chunk.toolResult!.id)
              if (tc) {
                tc.result = chunk.toolResult.output
                tc.status = chunk.toolResult.ok === false ? 'error' : 'ok'
                notify()
              }
            }
            if (chunk.approval) {
              assistant.approval = chunk.approval
              const tc = assistant.toolCalls?.find((x) => x.id === chunk.approval!.toolCallId)
              if (tc) tc.approval = chunk.approval
              notify()
            }
            if (chunk.usage) { state.usage = chunk.usage; notify() }
            if (chunk.step !== undefined) { state.step = chunk.step; notify() }
            if (chunk.error) { state.error = chunk.error; assistant.status = 'error'; notify() }
            if (chunk.done) { state.step = null; notify() }
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
      // **同一性纪律（2027-XX——审批后回复丢失实证修复）**：此前 state.messages.map
      // 替换消息对象——send 循环闭包仍持旧 assistant 引用写 content——审批后
      // 到达的 token 全写进游离对象（UI 永不更新——HITL 审批期间流未结束必现）。
      // 改原地修改 toolCall（对象引用保持——流式写入不丢失）
      let applied = false
      for (const m of state.messages) {
        for (const tc of m.toolCalls ?? []) {
          if (tc.approved) continue
          tc.approved = decision !== 'rejected'
          if (note) tc.feedback = note
          if (decision === 'modified' && modifiedArgs) tc.args = modifiedArgs
          applied = true
          break
        }
        if (applied) break
      }
      notify()
    },
  }

  return handle
}
