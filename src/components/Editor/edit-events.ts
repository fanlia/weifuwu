/**
 * weifuwu/components/Editor/edit-events — 编辑事件流（第四端）
 *
 * 与 ai/sandbox 事件流同构（design/ai-events-plan.md / sandbox-events-plan.md）：
 * 环形缓冲 + 查询（按动作过滤）+ 订阅 + 全局调试工具。
 *
 * 桥接（跨层一条链）：
 * - vdom3 stream：每 commit 一条摘要（降频——细粒度事件只在本缓冲）
 * - ai：edit:ai-apply 事件带 messageId 关联键（↔ ai 事件流 wf:token/done）
 * - sandbox：source: 'sandbox' 的 commit 带 toolCallId（↔ sandbox exec 事件）
 */

export type EditAction =
  | 'text-insert' | 'text-delete'
  | 'mark-apply' | 'block-set'
  | 'embed-insert' | 'embed-delete'
  | 'ai-apply' | 'ai-accept' | 'ai-reject'
  | 'commit' | 'undo' | 'redo' | 'clear'

export interface EditStreamEvent {
  entity: 'edit'
  action: EditAction
  ts: number
  target?: string      // commit id / messageId 关联
  payload?: Record<string, unknown>
}

const CAPACITY = 2000
const buf: EditStreamEvent[] = []
let head = 0
let len = 0

const listeners = new Set<(e: EditStreamEvent) => void>()

export function editEmit(action: EditAction, payload?: Record<string, unknown>, target?: string): void {
  const ev: EditStreamEvent = { entity: 'edit', action, ts: Date.now() }
  if (target != null) ev.target = target
  if (payload != null) ev.payload = payload
  if (len < CAPACITY) {
    buf[(head + len) % CAPACITY] = ev
    len++
  } else {
    buf[head] = ev
    head = (head + 1) % CAPACITY
  }
  for (const fn of [...listeners]) {
    try { fn(ev) } catch { /* 订阅者失败隔离 */ }
  }
}

/** 查询（倒序返回——最新在前；filter 按 action 过滤） */
export function editEvents(n?: number, filter?: { action?: EditAction | EditAction[] }): EditStreamEvent[] {
  const count = n ?? len
  const out: EditStreamEvent[] = []
  for (let k = 0; k < Math.min(count, len); k++) {
    const ev = buf[(head + len - 1 - k) % CAPACITY]
    if (!filter) { out.push(ev); continue }
    const actions = Array.isArray(filter.action) ? filter.action : (filter.action ? [filter.action] : null)
    if (actions && !actions.includes(ev.action)) continue
    out.push(ev)
  }
  return out
}

export function subscribeEditEvents(fn: (e: EditStreamEvent) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** 测试隔离 */
export function resetEditEvents(): void {
  buf.length = 0
  head = 0
  len = 0
  listeners.clear()
}

// 全局调试工具（与 __wf_tail / __ai_events / __sandbox_events 同风格）
if (typeof globalThis !== 'undefined') {
  const w = globalThis as any
  if (!w.__edit_tail) {
    w.__edit_tail = (n = 50, action?: EditAction | EditAction[]) => editEvents(n, action ? { action } : undefined)
  }
}
