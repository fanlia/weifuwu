/**
 * vdom2 lifecycle — 节点生命周期状态机（2026-12）
 *
 * 与 x2y（diff 转换状态机）/ KEY_DIFFERS（key 模式状态机）同构的第三个状态机：
 * 节点的构建/清理由**显式状态**管理——根治「dispose 掏空旧树但 build 剪枝按引用误判可用」
 * 的不一致（demo 搜索序列：Section null→恢复后剪枝复用半残旧树 → diff 遇未构建组件 →
 * renderComp 抛「not built」）。
 *
 * 状态：
 *   fresh    —— JSX 刚创建（未构建：无 _id/_render/_child）
 *   building —— buildVNode 处理中（异步工厂 await 中）
 *   built    —— 已构建（_render/_child 已设——diff 可渲染）
 *   pruned   —— 剪枝复用（_child 复用旧树——状态保持）
 *   disposed —— 已清理（diff 移除 → 掏空 _render/_child）
 *
 * 关键不变量（由 dispose 整树递归保证）：组件非 disposed ⟹ 子树全部非 disposed——
 * 剪枝只检查自身生命周期即可，无需深度验证 _child 内部（O(n) 太贵）。
 */

import { trace, traceEnabled } from './trace.ts'

/** 节点生命周期状态 */
export type Lifecycle = 'fresh' | 'building' | 'built' | 'pruned' | 'disposed'

/** 生命周期事件（状态转换触发点） */
export type LifecycleEvent = 'BUILD_START' | 'BUILD_DONE' | 'PRUNE' | 'DISPOSE'

/** 转换表（状态 × 事件 → 下一状态）——非法转换返回 null（audit/调试暴露，不抛错不静默）
 * 组件：fresh --BUILD_START--> building --BUILD_DONE--> built（异步工厂 await）
 * native/Fragment/Portal：fresh --BUILD_DONE--> built（同步递归构建——无中间态） */
const TRANSITIONS: Record<Lifecycle, Partial<Record<LifecycleEvent, Lifecycle>>> = {
  fresh:    { BUILD_START: 'building', BUILD_DONE: 'built', PRUNE: 'pruned', DISPOSE: 'disposed' },
  building: { BUILD_DONE: 'built', DISPOSE: 'disposed' },
  built:    { BUILD_START: 'building', PRUNE: 'pruned', DISPOSE: 'disposed' },
  pruned:   { BUILD_START: 'building', PRUNE: 'pruned', DISPOSE: 'disposed' },
  disposed: { BUILD_START: 'building' }, // 重建（搜索恢复/组件复用）
}

/** 生命周期 trace 上下文（组件视角可观测——组件名 + 实例 id + 深度） */
export interface LifecycleTraceCtx {
  name?: string
  id?: string | null
  depth?: number
}

/** 从 vnode 提取 trace 上下文（组件名 + 实例 id + _parentVNode 链深度——尽力，链可能不完整） */
export function vnodeTraceCtx(vnode: { type: unknown; _id?: string | null; _parentVNode?: unknown }): LifecycleTraceCtx {
  let depth = 0
  let p: unknown = vnode._parentVNode ?? null
  for (let i = 0; i < 10 && p; i++) {
    depth++
    p = (p as { _parentVNode?: unknown })._parentVNode ?? null
  }
  return {
    name: typeof vnode.type === 'function' ? ((vnode.type as { name?: string }).name || 'anonymous') : String(vnode.type),
    id: vnode._id ?? null,
    depth,
  }
}

/** 生命周期时间线（组件视角历史追溯——__vdom_lc(id) 查询）
 *  Map<组件id, { name, events: ['fresh→building', ...] }>——保留最近 N 条 */
const timeline = new Map<string, { name: string; events: string[] }>()
const TIMELINE_MAX = 50

/** 记录生命周期转换到时间线（tctx.id 存在时） */
function recordTimeline(tctx: LifecycleTraceCtx | undefined, from: Lifecycle, event: LifecycleEvent, to: Lifecycle): void {
  if (!tctx?.id) return
  let entry = timeline.get(tctx.id)
  if (!entry) {
    entry = { name: tctx.name ?? '?', events: [] }
    timeline.set(tctx.id, entry)
  }
  entry.events.push(`${from}--${event}-->${to}`)
  if (entry.events.length > TIMELINE_MAX) entry.events.shift()
}

/** 查询生命周期时间线（全组件或单组件）——__vdom_lc(id?) */
export function dumpTimeline(id?: string): string {
  if (id) {
    const e = timeline.get(id)
    return e ? `${e.name}(${id}): ${e.events.join(' → ')}` : `no timeline for ${id}`
  }
  return [...timeline.entries()]
    .map(([k, v]) => `${v.name}(${k}): ${v.events.join(' → ')}`)
    .join('\n')
}

/** 状态转换执行（非法转换 → 保留原状态 + trace warn——不静默吞掉）
 *  tctx：trace 上下文（组件名/id/深度——trace 输出 `Name(id)[d0] from --event--> to`） */
export function transition(from: Lifecycle, event: LifecycleEvent, tctx?: LifecycleTraceCtx): Lifecycle {
  const next = TRANSITIONS[from]?.[event] ?? null
  const who = tctx ? `${tctx.name ?? '?'}(${tctx.id ?? '?'})[d${tctx.depth ?? 0}]` : '?'
  if (next == null) {
    if (traceEnabled('lifecycle')) {
      trace('lifecycle', 'warn', '', `illegal transition ${who} ${from} --${event}--> ?`)
    }
    return from
  }
  recordTimeline(tctx, from, event, next)
  if (traceEnabled('lifecycle', 'debug')) {
    trace('lifecycle', 'debug', '', `${who} ${from} --${event}--> ${next}`)
  }
  return next
}

/** 旧树复用有效性（I3——所有复用路径统一检查）：
 *  - 生命周期非 disposed（dispose 显式标记——根治「引用还在但内容被掏空」的误判）
 *  - 旧 _child 非 null（有可复用输出）
 *  - _child 树无 disposed（深检查——portal 内容独立 dispose（remoteEl 移除）会打破
 *    「父非 disposed ⟹ 子树全非 disposed」：DemoDrawer 剪枝复用含 disposed Button/Drawer
 *    的输出——demo 搜索序列实测；正确性优先，性能后续用 dirty 标记优化） */
export function canReuse(oldV: { _lifecycle?: Lifecycle; _child?: unknown } | null | undefined): boolean {
  if (!oldV || oldV._lifecycle === 'disposed' || oldV._child == null) return false
  return !treeHasDisposed(oldV._child)
}

/** 递归检查子树是否含 disposed vnode（_child 树——不含 props.children 原始 JSX） */
function treeHasDisposed(child: unknown): boolean {
  if (child == null || typeof child !== 'object') return false
  if (Array.isArray(child)) {
    for (const c of child) if (treeHasDisposed(c)) return true
    return false
  }
  const v = child as { _lifecycle?: Lifecycle; _child?: unknown }
  if (v._lifecycle === 'disposed') return true
  if (v._child != null && treeHasDisposed(v._child)) return true
  return false
}
