/**
 * vdom/trace — 结构化调试 trace（阶段级开关 + 渲染会话 traceId）
 *
 * 目的（design 归档）：
 * - 一次建立全面 vdom 调试能力：build/render/diff/mount/audit 各阶段独立开关
 * - traceId 关联同一渲染会话（renderByIds/首帧/导航）的全部日志——事故可回放
 * - children 顺序可视化（kidsSeq）——快速定位顺序错乱类 bug（Fragment/数组项）
 *
 * 开启方式（三路，幂等解析）：
 *   1. URL query：?vdom_trace=build,render,diff（阶段子集）；?vdom_trace=render:trace（阶段+级别）；
 *      ?vdom_debug=1（兼容旧开关——全开 debug + audit）
 *   2. 全局变量（页面加载前注入）：window.__vdom_trace__ = { stages, level }
 *   3. localStorage：localStorage.vdom_trace = 'render:debug'（运行时设置 + reload）
 *
 * 性能：关闭时零开销——trace() 首行 flag 检查；插桩点用 traceEnabled() 前置检查
 * （关闭时连参数求值都跳过）。开启时高频路径（diff 逐位置）默认 trace 级（低于默认 debug）。
 *
 * 与 ../debug.ts（uiLog——递归深度/死循环定位）互补：trace 是阶段结构化日志，
 * uiLog 是深度跟踪——两者独立开关、不冲突。
 */

import type { VNodeChild, VNode } from '../vnode.ts'
import { Fragment, Portal } from '../vnode.ts'
import { dumpTimeline } from './lifecycle.ts'

export type VdomStage = 'mount' | 'build' | 'render' | 'diff' | 'lifecycle' | 'route' | 'audit'
export type VdomLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace'

const LEVELS: Record<VdomLevel, number> = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 }
const STAGES: VdomStage[] = ['mount', 'build', 'render', 'diff', 'lifecycle', 'route', 'audit']

export interface VdomTraceConfig {
  enabled: boolean
  /** 空 Set = 全阶段开启 */
  stages: Set<VdomStage>
  /** 最低级别（info 起；debug/trace 明细） */
  level: VdomLevel
  /** 组件名过滤（只输出含该名称的组件相关日志；null = 不过滤） */
  filter: string | null
}

let cfg: VdomTraceConfig = { enabled: false, stages: new Set(), level: 'info', filter: null }
let _initDone = false

function parseLevel(s: string | null): VdomLevel {
  if (s && s in LEVELS) return s as VdomLevel
  return 'info'
}

function parseStages(s: string | null): Set<VdomStage> {
  const set = new Set<VdomStage>()
  if (!s) return set
  for (const part of s.split(',')) {
    const name = part.trim().split(':')[0] as VdomStage
    if (STAGES.includes(name)) set.add(name)
  }
  return set
}

/**
 * 解析开启配置（幂等——首次调用后缓存）。
 * uiServe 在首帧渲染前调用一次；测试/Node 环境也可手动调用。
 */
export function initVdomTrace(): VdomTraceConfig {
  if (_initDone) return cfg
  _initDone = true
  try {
    const g = globalThis as unknown as {
      location?: { search?: string }
      localStorage?: { getItem?(k: string): string | null }
      __vdom_trace__?: Partial<VdomTraceConfig>
    }
    // 1. URL query
    const q = new URLSearchParams(typeof g.location?.search === 'string' ? g.location.search : '')
    const qStages = q.get('vdom_trace')
    const qDebug = q.get('vdom_debug')
    // 2. 全局变量（页面加载前注入）
    const gCfg = g.__vdom_trace__
    // 3. localStorage
    const ls = typeof g.localStorage?.getItem === 'function' ? g.localStorage.getItem('vdom_trace') : null

    if (qDebug === '1' || g?.localStorage?.getItem?.('__WF_VDOM_DEBUG') === '1') {
      cfg = { enabled: true, stages: new Set(STAGES), level: 'debug', filter: null }
    } else if (qStages || gCfg || ls) {
      const stages = new Set<VdomStage>()
      if (qStages) for (const s of parseStages(qStages)) stages.add(s)
      if (gCfg?.stages) {
        const gs = Array.isArray(gCfg.stages) ? gCfg.stages : [...gCfg.stages]
        for (const s of gs) stages.add(s as VdomStage)
      }
      if (ls) for (const s of parseStages(ls)) stages.add(s)
      cfg = {
        enabled: true,
        stages,
        // 无显式级别默认 debug（能看明细）——显式 :trace/:debug/:info 才降/升
        level: qStages?.includes(':') ? parseLevel(qStages.split(':')[1]) : (gCfg?.level ?? 'debug'),
        filter: typeof gCfg?.filter === 'string' ? gCfg.filter : null,
      }
    }
  } catch { /* 环境无 location/localStorage——忽略 */ }
  return cfg
}

/** 插桩点前置检查：阶段开启 + 级别满足（关闭时连参数求值都跳过） */
export function traceEnabled(stage: VdomStage, level: VdomLevel = 'info'): boolean {
  if (!cfg.enabled) {
    // 未初始化时先尝试一次（全局变量直开场景——页面加载前 window.__vdom_trace__）
    if (!_initDone) initVdomTrace()
    if (!cfg.enabled) return false
  }
  if (cfg.stages.size && !cfg.stages.has(stage)) return false
  return LEVELS[level] <= LEVELS[cfg.level]
}

/** 输出 trace 日志（[vdom:{stage}] {traceId} {msg}） */
export function trace(stage: VdomStage, level: VdomLevel, msg: string, ...args: unknown[]): void {
  if (!traceEnabled(stage, level)) return
  const filter = cfg.filter
  if (filter && !msg.includes(filter)) return
  // eslint-disable-next-line no-console
  console.log(`[vdom:${stage}]  ${msg}`, ...args)
}

/** 手动配置（测试/调试用——不受 init 时序/缓存影响） */
export function configureVdomTrace(c: Partial<Omit<VdomTraceConfig, 'enabled'>>): void {
  cfg.enabled = true
  if (c.stages) cfg.stages = new Set(c.stages)
  cfg.level = c.level ?? 'debug' // 默认 debug（与 initVdomTrace 的 URL 语义一致——可见 build/render/diff/lifecycle 明细）
  if (c.filter !== null && c.filter !== undefined) cfg.filter = c.filter
}

/** 渲染会话 traceId：R{seq}——同一渲染的 build→render→diff 日志共享 */
let _seq = 0
export function nextTraceId(tag?: string): string {
  return `R${++_seq}${tag ? `:${tag}` : ''}`
}

// ── 摘要函数（children 顺序可视化——定位顺序错乱类 bug 的关键工具） ──

/** children 顺序摘要：["div#list-simple | false | ARR(2) | str"] */
export function kidsSeq(kids: VNodeChild[] | null, max = 12): string {
  if (!kids) return '∅'
  if (typeof kids === 'string' || typeof kids === 'number') return `"${kids}"`
  if (!Array.isArray(kids)) return vnDesc(kids)
  const parts = kids.slice(0, max).map(vnDesc)
  if (kids.length > max) parts.push(`…+${kids.length - max}`)
  return `[${parts.join(' | ')}]`
}

/** type 类别（名称解析查表分派——vnDesc/dumpTree 共用） */
type TypeClass = 'function' | 'fragment' | 'string' | 'other'
function typeClassOf(t: unknown): TypeClass {
  if (typeof t === 'function') return 'function'
  if (t === Fragment) return 'fragment'
  if (typeof t === 'string') return 'string'
  return 'other'
}

/** 短名表（vnDesc——trace 摘要紧凑格式） */
const NAME_SHORT: Record<TypeClass, (t: unknown) => string> = {
  function: (t) => (t as { name?: string }).name || 'Comp',
  fragment: () => 'Frag',
  string: (t) => String(t),
  other: (t) => String(t),
}
/** 全名表（dumpTree——快照详细格式，Portal 区分） */
const NAME_FULL: Record<TypeClass, (t: unknown) => string> = {
  function: (t) => (t as { name?: string }).name || 'anonymous',
  fragment: () => 'Fragment',
  string: (t) => String(t),
  other: (t) => (t === Portal ? 'Portal' : String(t)),
}

/** 单值摘要（children 项） */
export function vnDesc(v: VNodeChild): string {
  if (v == null || typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return `"${v.slice(0, 16)}"`
  if (typeof v === 'number') return String(v)
  if (Array.isArray(v)) return `ARR(${v.length})`
  const vn = v as VNode
  const t = vn.type
  const name = NAME_SHORT[typeClassOf(t)](t)
  const id = vn.props?.id ? `#${vn.props.id}` : vn.key != null ? `@${vn.key}` : ''
  return name + id
}

/** DOM 节点摘要 */
export function nodeDesc(n: Node | null): string {
  if (!n) return 'null'
  if (n.nodeType === 1) {
    const el = n as Element
    return `${el.tagName}${el.id ? `#${el.id}` : ''}${el.getAttribute?.('data-wf-key') ? `@${el.getAttribute('data-wf-key')}` : ''}`
  }
  if (n.nodeType === 3) return `"${(n.textContent ?? '').slice(0, 12)}"`
  if (n.nodeType === 8) return `<!--${(n.nodeValue ?? '').slice(0, 40)}-->`
  return `#${n.nodeType}`
}

/** DOM 子节点序列摘要（childNodes 顺序——与 kidsSeq 对照验证顺序一致性） */
export function childNodesSeq(parent: Node | null, max = 12): string {
  if (!parent) return 'null'
  const nodes = Array.from(parent.childNodes).slice(0, max)
  const parts = nodes.map(nodeDesc)
  if (parent.childNodes.length > max) parts.push(`…+${parent.childNodes.length - max}`)
  return `[${parts.join(' | ')}]`
}

// ── 全树生命周期快照（组件视角 dump——__vdom_dump / __vdom_inspect） ──

/** 递归打印 vnode 树快照：type + id + lifecycle + 深度缩进（组件视角——整页可观测） */
export function dumpTree(vnode: VNodeChild, depth = 0): string[] {
  if (vnode == null || typeof vnode === 'boolean') return []
  if (typeof vnode === 'string' || typeof vnode === 'number') return [`${'  '.repeat(depth)}"${String(vnode).slice(0, 20)}"`]
  if (Array.isArray(vnode)) return vnode.flatMap((c) => dumpTree(c, depth))
  const v = vnode as VNode
  const t = v.type
  const name = NAME_FULL[typeClassOf(t)](t)
  const lc = v._lifecycle ? `[${v._lifecycle}]` : ''
  const id = v._id ? `(${v._id})` : ''
  const lines = [`${'  '.repeat(depth)}${name}${id}${lc}`]
  const child = v._child
  if (child != null) lines.push(...dumpTree(child, depth + 1))
  return lines
}

/** 安装全局调试 API（dev/调试——页面加载后可用）：
 *  __vdom_dump()      全树生命周期快照（root 由调用方注入）
 *  __vdom_lc(id?)     生命周期时间线（全组件或单组件） */
export function installVdomInspect(rootGetter: () => VNodeChild | null | undefined): void {
  const g = globalThis as Record<string, unknown>
  if (g.__vdom_dump == null) {
    g.__vdom_dump = () => dumpTree(rootGetter() ?? null).join('\n')
  }
  if (g.__vdom_lc == null) {
    g.__vdom_lc = (id?: string) => dumpTimeline(id)
  }
}
