/**
 * Sandbox 事件流 — 沙盒层的事件流化（与前端 vdom3 "DOM = fold(事件流)" 同哲学）
 *
 * 不变量：容器期望状态 = fold(sandbox 事件流)——沙盒的一切操作（生命周期/
 * exec/挂载/镜像/调度）都有事件——状态可回放/可对照（docker 实际）/可审计。
 *
 * 事件命名统一：{ entity: 'sandbox', action, target: sandboxId, payload }——
 * 与前端 { entity, action, target, payload } 同构（对象 + 动作 + 参数）。
 *
 * 存储：内存环形缓冲（最近 N 条——溢出覆盖——与前端 stream 同构）；
 * 持久化/TTL 为后续阶段（exec 摘要归档——降频聚合）。
 */

export interface SandboxEvent {
  entity: 'sandbox'
  action: string
  target?: string
  payload?: Record<string, unknown>
  /** 任务会话（统一 schema——阶段 2 由 requestId 填充——跨端关联键） */
  session?: string
  ts: number
}

const MAX_EVENTS = 5000
const buf: SandboxEvent[] = []
let head = 0
let len = 0
// 持久化订阅（阶段 4——结果类事件入库——emit 同步回调——不丢事件）
const persistListeners = new Set<(e: SandboxEvent) => void>()

/** 发射（环形缓冲 O(1)——溢出覆盖最旧） */
export function sandboxEmit(action: string, target?: string, payload?: Record<string, unknown>): void {
  const evt: SandboxEvent = { entity: 'sandbox', action, ts: Date.now() }
  if (target != null) evt.target = target
  if (payload != null) evt.payload = payload
  if (len < MAX_EVENTS) { buf[(head + len) % MAX_EVENTS] = evt; len++ }
  else { buf[head] = evt; head = (head + 1) % MAX_EVENTS }
  for (const fn of persistListeners) { try { fn(evt) } catch { /* 订阅者失败隔离 */ } }
}

/** 持久化订阅（阶段 4——manager 订阅结果类事件入库——返回退订） */
export function subscribeSandboxEvents(fn: (e: SandboxEvent) => void): () => void {
  persistListeners.add(fn)
  return () => { persistListeners.delete(fn) }
}

/** 查询（最近 N 条——可按 sandboxId/action 过滤） */
export function sandboxEvents(n = 100, filter?: { sandboxId?: string; action?: string }): SandboxEvent[] {
  const out: SandboxEvent[] = new Array(len)
  for (let i = 0; i < len; i++) out[i] = buf[(head + i) % MAX_EVENTS]
  const slice = out.slice(-n)
  if (!filter) return slice
  return slice.filter((e) => {
    if (filter.sandboxId && e.target !== filter.sandboxId) return false
    if (filter.action && e.action !== filter.action) return false
    return true
  })
}

/** 重置（测试隔离） */
export function resetSandboxEvents(): void {
  head = 0
  len = 0
}

// ── 集群聚合（阶段 2）：跨宿主事件缓冲（远程宿主上报 → 中心统一查询） ──
const HOST_MAX = 20000
const hostBuf: SandboxEvent[] = []
let hostHead = 0
let hostLen = 0

/** 中心接收远程宿主事件（sandbox-host ws 上报——hostId 已由宿主标注） */
export function hostEventIngest(e: SandboxEvent): void {
  const evt = { ...e, ts: Date.now() }
  if (hostLen < HOST_MAX) { hostBuf[(hostHead + hostLen) % HOST_MAX] = evt; hostLen++ }
  else { hostBuf[hostHead] = evt; hostHead = (hostHead + 1) % HOST_MAX }
}

/** 跨宿主统一查询（本地 + 远程——host 过滤） */
export function clusterEvents(n = 100, filter?: { hostId?: string; sandboxId?: string; action?: string }): SandboxEvent[] {
  // local 部分也按 hostId 过滤（本地宿主事件 hostId='local'——远程宿主事件在 hostBuf）
  const localAll = sandboxEvents(1000, { sandboxId: filter?.sandboxId, action: filter?.action })
  const local = filter?.hostId
    ? localAll.filter((e) => e.payload?.hostId === filter.hostId || (filter.hostId === 'local' && !e.payload?.hostId))
    : localAll
  const remote: SandboxEvent[] = new Array(hostLen)
  for (let i = 0; i < hostLen; i++) remote[i] = hostBuf[(hostHead + i) % HOST_MAX]
  const remoteFiltered = hostLen > 0
    ? remote.filter((e) => {
        if (filter?.hostId && e.payload?.hostId !== filter.hostId) return false
        if (filter?.sandboxId && e.target !== filter.sandboxId) return false
        if (filter?.action && e.action !== filter.action) return false
        return true
      })
    : []
  return [...local, ...remoteFiltered].slice(-n)
}

// 全局调试工具（浏览器/服务端可查——与前端 __wf_tail 同风格）
if (typeof globalThis !== 'undefined') {
  const g = globalThis as any
  if (!g.__sandbox_events) {
    g.__sandbox_events = (n = 100, filter?: { sandboxId?: string; action?: string }) => sandboxEvents(n, filter)
    g.__sandbox_tail = (n = 50) => sandboxEvents(n)
    g.__cluster_events = (n = 100, filter?: { hostId?: string; action?: string }) => clusterEvents(n, filter as any)
  }
}
