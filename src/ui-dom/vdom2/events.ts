/**
 * vdom/events — 统一状态机事件总线
 *
 * 状态机管"转换"（route/lifecycle/x2y/keys/pos），事件总线管"观测"：
 * 所有状态转换统一发射结构化 VdomEvent，多路 sink 消费——
 * - console sink：人类可读（复用 trace 阶段开关，格式兼容旧 trace 输出）
 * - ring buffer sink：内存最近 N 条（__vdom_events(n) 查询——事故现场可追溯）
 * - collect sink：测试断言（makeEventCollector——事件序列断言，过程级而非结果级）
 * - audit sink：不变量校验器（订阅事件流而非事后遍历 DOM——阶段 2）
 *
 * 事件 = "决策记录"（同步、纯，不执行 DOM）；执行层（appendChild/坐标计算）不进事件流。
 * 性能：emit 首行检查——无观测者或 trace 关闭时仅一次布尔比较；payload 支持惰性函数
 * （高频 diff 事件只在有消费者需要时才求值，避免 vnDesc/nodeDesc 的字符串成本）。
 */

import { traceEnabled, type VdomLevel, type VdomStage } from './trace.ts'

/** 状态机名（事件来源）——含执行细节摘要通道（build/render/diff/mount——trace 包装） */
export type VdomMachine = 'route' | 'lifecycle' | 'x2y' | 'keys' | 'pos' | 'render' | 'audit' | 'build' | 'mount' | 'diff'

/** machine → trace 阶段映射（console sink 可见性门控复用 trace 开关） */
const MACHINE_TO_STAGE: Record<VdomMachine, VdomStage> = {
  route: 'route',
  lifecycle: 'lifecycle',
  x2y: 'diff',
  keys: 'diff',
  pos: 'diff',
  render: 'render',
  audit: 'audit',
  build: 'build',
  mount: 'mount',
  diff: 'diff',
}

export function machineToStage(m: VdomMachine): VdomStage {
  return MACHINE_TO_STAGE[m]
}

/** 统一状态机事件（一次渲染会话的全部转换通过 session 关联） */
export interface VdomEvent {
  /** 渲染会话 id（R{n}——同一渲染的 build/render/diff 事件共享；阶段 2 接入贯穿） */
  session: string
  machine: VdomMachine
  /** 关联 vnode id（_id——按实例过滤/追溯） */
  nodeId: string | null
  /** 组件名/类型名（尽力） */
  component: string | null
  from: string
  event: string
  to: string
  /** 附加数据（key/i/path 等）——可传函数惰性求值（高频路径零字符串成本） */
  payload?: unknown
  /** 输出级别（console sink 门控；默认 debug） */
  level?: VdomLevel
  ts: number
}

export type EventSink = (ev: VdomEvent) => void

const sinks = new Set<EventSink>()

/** 注册事件 sink（返回退订函数） */
export function onVdomEvent(sink: EventSink): () => void {
  sinks.add(sink)
  return () => { sinks.delete(sink) }
}

/** payload 惰性求值 + 分发（sink 错误隔离——不中断渲染管线） */
export function emit(ev: VdomEvent): void {
  if (sinks.size === 0) return
  // 惰性 payload：仅当有消费者需要时才求值（collect sink 或 trace 开启）
  if (typeof ev.payload === 'function') {
    const need = sinks.size > 1 || traceEnabled(machineToStage(ev.machine), ev.level ?? 'debug')
    if (need) ev.payload = (ev.payload as () => unknown)()
  }
  for (const s of sinks) {
    try { s(ev) } catch { /* sink 错误隔离 */ }
  }
}

/** 是否存在「console 之外」的观测 sink（ring/collect）——trace() 包装的 emit 门槛：
 *  trace 关闭但测试收集/调试 ring 存在时，执行细节事件仍要发射（供断言/追溯） */
export function hasObservingSinks(): boolean {
  return sinks.size > 1
}

/** 可读 payload 摘要（console sink 用） */
function fmtPayload(p: unknown): string {
  if (p == null) return ''
  if (typeof p === 'string') return ` ${p}`
  if (typeof p === 'object') {
    const o = p as Record<string, unknown>
    const parts: string[] = []
    for (const k of ['path', 'i', 'key', 'mode', 'kind', 'insertedBefore', 'after', 'depth']) {
      if (o[k] !== undefined) {
        const v = o[k]
        parts.push(`${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      }
    }
    return parts.length ? ' ' + parts.join(' ') : ''
  }
  return ` ${String(p)}`
}

// ── console sink（复用 trace 开关——格式兼容旧 trace 输出） ──
function consoleSink(ev: VdomEvent): void {
  const stage = machineToStage(ev.machine)
  if (!traceEnabled(stage, ev.level ?? 'debug')) return
  // TRACE 事件 = trace() 包装（执行细节摘要——输出原始 msg，保持旧格式）
  if (ev.event === 'TRACE') {
    // eslint-disable-next-line no-console
    console.log(`[vdom:${ev.machine}]  ${ev.payload as string}`)
    return
  }
  const who = ev.component
    ? `${ev.component}${ev.nodeId ? `(${ev.nodeId})` : ''}`
    : (ev.nodeId ? `(${ev.nodeId})` : '')
  // eslint-disable-next-line no-console
  console.log(`[vdom:${ev.machine}]  ${who ? who + ' ' : ''}${ev.from} --${ev.event}--> ${ev.to}${fmtPayload(ev.payload)}`)
}
onVdomEvent(consoleSink)

// ── ring buffer sink（调试 API 惰性注册——内存最近 N 条） ──
const RING_MAX = 500
const ring: VdomEvent[] = []
let ringRegistered = false
function ringSink(ev: VdomEvent): void {
  ring.push(ev)
  if (ring.length > RING_MAX) ring.shift()
}
function ensureRing(): void {
  if (!ringRegistered) { ringRegistered = true; onVdomEvent(ringSink) }
}

/** 注册 ring buffer sink（uiServe 初始化时调用——页面生命周期内事件全程可追溯） */
export function installEventRing(): void {
  ensureRing()
}

/** 调试 API：查询最近事件（可按 machine/nodeId/event 过滤）——__vdom_events(50, { machine: 'lifecycle' }) */
export function __vdom_events(n = 50, filter?: Partial<VdomEvent>): VdomEvent[] {
  ensureRing()
  if (!filter) return ring.slice(-n)
  return ring.filter((e) =>
    Object.entries(filter).every(([k, v]) => (e as unknown as Record<string, unknown>)[k] === v),
  ).slice(-n)
}

/** 重置 ring buffer（测试隔离用） */
export function __resetVdomEvents(): void {
  ring.length = 0
}

// ── collect sink（测试断言——事件序列过程级验证） ──
export function makeEventCollector(): { events: VdomEvent[]; unsubscribe: () => void } {
  const events: VdomEvent[] = []
  const unsubscribe = onVdomEvent((ev) => { events.push(ev) })
  return { events, unsubscribe }
}
