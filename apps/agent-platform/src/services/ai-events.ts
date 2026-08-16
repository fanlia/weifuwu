/**
 * AI 事件流 — AI 调用层的事件流化（与 sandbox/vdom 同哲学）
 *
 * 三端打通：vdom（前端 DOM = fold(事件流)）+ ai（LLM 调用/工具决策）+
 * sandbox（容器/exec）——统一 { entity, action, target, payload }——
 * 全链路一条链（用户点击 → 前端渲染 → AI 工具决策 → 沙盒 exec）。
 *
 * 桥接：WfEmitter（wf:* 协议事件——前端流式消费）→ 此处 ai:* 事件
 * （统一模型——环形缓冲 + 查询——与 sandbox events.ts 同构）。
 *
 * 关联键（跨层）：
 * - target = agentId（AI 调用者）
 * - payload.messageId（AI 回复——与前端 wf:token 的 messageId 关联）
 * - payload.departmentId + tool（与沙盒 exec 事件的 departmentId/tool 关联——
 *   时间窗内——工具调用 ↔ 沙盒 exec 一条链）
 */

export interface AiEvent {
  entity: 'ai'
  action: string
  target?: string
  payload?: Record<string, unknown>
  /** 任务会话（统一 schema——vdom session 同语义——按会话过滤/回放——
   *  阶段 1 用 messageId（每次 AI 回复一会话）——阶段 2 由 requestId 精确填充） */
  session?: string
  ts: number
}

const MAX_EVENTS = 5000
const buf: AiEvent[] = []
let head = 0
let len = 0
const persistListeners = new Set<(e: AiEvent) => void>()

/** 发射（环形缓冲 O(1)——溢出覆盖最旧——同步回调持久化订阅） */
export function aiEmit(action: string, target?: string, payload?: Record<string, unknown>): void {
  const evt: AiEvent = { entity: 'ai', action, ts: Date.now() }
  if (target != null) evt.target = target
  if (payload != null) evt.payload = payload
  if (payload?.messageId) evt.session = String(payload.messageId) // 任务会话 = messageId（阶段 1）
  if (len < MAX_EVENTS) { buf[(head + len) % MAX_EVENTS] = evt; len++ }
  else { buf[head] = evt; head = (head + 1) % MAX_EVENTS }
  for (const fn of persistListeners) { try { fn(evt) } catch { /* 订阅者失败隔离 */ } }
}

/** 持久化订阅（结果类事件入库——返回退订） */
export function subscribeAiEvents(fn: (e: AiEvent) => void): () => void {
  persistListeners.add(fn)
  return () => { persistListeners.delete(fn) }
}

/** 查询（最近 N 条——按 agentId/action/messageId 过滤） */
export function aiEvents(n = 100, filter?: { agentId?: string; action?: string; messageId?: string }): AiEvent[] {
  return aiEventsFiltered(n, filter)
}
function aiEventsFiltered(n: number, filter?: { agentId?: string; action?: string; messageId?: string }): AiEvent[] {
  const out: AiEvent[] = new Array(len)
  for (let i = 0; i < len; i++) out[i] = buf[(head + i) % MAX_EVENTS]
  const slice = out.slice(-n)
  if (!filter) return slice
  return slice.filter((e) => {
    if (filter.agentId && e.target !== filter.agentId) return false
    if (filter.action && e.action !== filter.action) return false
    if (filter.messageId && e.payload?.messageId !== filter.messageId) return false
    return true
  })
}

/** 重置（测试隔离） */
export function resetAiEvents(): void {
  head = 0
  len = 0
}

/** wf:* → ai:* 映射（WfEmitter 桥接——统一命名） */
export function aiActionFromWf(name: string): string {
  switch (name) {
    case 'wf:token': return 'token'
    case 'wf:step': return 'step'
    case 'wf:tool_call': return 'tool:call'
    case 'wf:tool_result': return 'tool:result'
    case 'wf:done': return 'done'
    case 'wf:error': return 'error'
    case 'wf:usage': return 'usage'
    case 'wf:verify': return 'verify'
    default: return name.replace('wf:', '')
  }
}

// 全局调试工具（服务端可查——与 __sandbox_events 同风格）
if (typeof globalThis !== 'undefined') {
  const g = globalThis as any
  if (!g.__ai_events) {
    g.__ai_events = (n = 100, filter?: { agentId?: string; action?: string; messageId?: string }) => aiEvents(n, filter)
  }
  // 三端统一时间线（阶段 4）：requestId 聚合 ai + sandbox——一次请求的完整链
  if (!g.__events_timeline) {
    g.__events_timeline = (requestId: string) => {
      const { sandboxEvents } = requireSandboxEvents()
      const ai = aiEvents(2000).filter((e) => e.payload?.requestId === requestId)
      const sb = sandboxEvents(2000).filter((e) => e.payload?.requestId === requestId)
      const all = [
        ...ai.map((e) => ({ tier: 'ai', action: e.action, target: e.target, payload: e.payload, ts: e.ts })),
        ...sb.map((e) => ({ tier: 'sandbox', action: e.action, target: e.target, payload: e.payload, ts: e.ts })),
      ].sort((a, b) => a.ts - b.ts)
      return all
    }
  }
}
function requireSandboxEvents(): { sandboxEvents: (n: number) => AiEvent[] } {
  // 动态引用（避免循环依赖——sandbox events 是纯模块——globalThis 工具或空）
  const fn = (globalThis as any).__sandbox_events
  return { sandboxEvents: (n: number) => (typeof fn === 'function' ? fn(n) : []) }
}
