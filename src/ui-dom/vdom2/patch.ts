/**
 * vdom/diff — 同步 patch（阶段 2）
 *
 * **不变量：diff 只处理已构建树**——组件 vnode 必已 `_render`/`_child`（buildVNode 预构建）。
 * 遇未构建组件 → throw（开发期暴露；生产路径 renderByIds/导航都先 buildVNode await）。
 * 这是第 1 代死循环的根治：diff 永不调用组件工厂、无 resolve 回调、无补全循环。
 *
 * 三态 skip：props 同 + 无 dirty + ctx 版本同 → 复用旧 _child（renderFn 不重跑）。
 */

import type { VNode, VNodeChild } from '../vnode.ts'
import { Fragment, Portal, arrayChildren, isFrag, isComp, isNative, isPortal, type PortalVNode } from '../vnode.ts'
// re-export（v1 导入点兼容——arrayChildren 已移至 vnode.ts 统一）
export { arrayChildren }
import { createClientBrowser } from '../browser.ts'
import { x2y } from './transitions.ts'
import { cleanupComponent, type Registry } from './registry.ts'
import { callRefCleanupFor } from './registry.ts'

/** 组件 vnode 从树中移除：ref(null) 递归 + 卸载钩子（cleanupComponent） */
export function disposeComponent(vnode: VNode, registry?: Registry): void {
  if (registry && typeof vnode.type === 'function' && vnode._id) {
    try { callRefCleanupFor(vnode, registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
    cleanupComponent(registry, vnode._id)
  }
}
import { renderValue } from './render.ts'
import { setProp, createHole, eventTarget, propChannelOf, type PropChannel } from './transform.ts'
import { trace, traceEnabled, kidsSeq, vnDesc, nodeDesc, childNodesSeq } from './trace.ts'
import { getOutputRange, classifyKind, type PatchState, keyModeOf, type KeyMode, type VKind } from './kind.ts'
import { auditEnabled } from './audit.ts'
import { canReuse } from './lifecycle.ts'
import { componentName } from './ctx.ts'
import { emit } from './events.ts'

/** A 级动态数组检测去重（表单类静态字段数组误报抑制——同一长度签名只报一次） */
const warnedDynamicArrays = new Set<string>()
/** 重置 audit 告警去重（测试隔离——node --test 同进程共享 module 状态） */
export function __resetAuditWarnings(): void { warnedDynamicArrays.clear() }


/** 从 vnode 取稳定 key（Portal 内部 key 不算用户 keyed） */
function getKey(v: VNodeChild): string | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null
  const vn = v as VNode
  // remote（portal）：portalKey 作 key（v1 语义——keyed diff 复用容器 patch 内容）。
  // C1（input+portal 焦点）由 allUnkeyed 判断排除 remote 保证——这里返回 key 不影响 allUnkeyed
  if (isPortal(vn)) return typeof vn.props?.portalKey === 'string' ? vn.props.portalKey : null
  return vn.key
}

/** 子项输出收集：Fragment 项展开全部 childNodes——patchValue 只返回锚点（首个节点），
 *  数组分支/frag 收全需要完整范围（否则 Fragment 后续节点残留——diff-fragment 真实 bug） */
function collectChildNodes(newC: VNodeChild, node: Node | null): (Node | null)[] {
  if (node && newC && typeof newC === 'object' && !Array.isArray(newC)) {
    // Fragment/组件（多节点输出）→ 展开全部输出节点（组件经 _outputChild 递归——
    // 只返回锚点则多节点输出其余节点落单——vdom-matrix 矩阵 compfrag→compfrag 失败）
    const range = getOutputRange(newC, node)
    if (range && range.length > 1) return range
  }
  return [node]
}

/** 递归 dispose 子树里的组件（Fragment/数组展开）——整体移除时组件状态清理（卸载钩子/ref） */
function disposeSubtree(v: VNode, registry?: Registry): void {
  const kids = arrayChildren(v.props?.children)
  for (const c of kids) {
    if (c == null || typeof c !== 'object' || Array.isArray(c)) continue
    const cv = c as VNode
    // 类型分派查表（DISPOSERS[kind]——comp → disposeComponent；frag/native/portal → 递归）
    DISPOSERS[classifyKind(cv)](cv, registry)
  }
}

/** 子树组件清理状态机表（kind → 清理行为） */
const DISPOSERS: Record<VKind, (v: VNode, reg?: Registry) => void> = {
  comp: (cv, reg) => { disposeComponent(cv, reg) },
  frag: (cv, reg) => { disposeSubtree(cv, reg) },
  native: (cv, reg) => { disposeSubtree(cv, reg) },
  portal: (cv, reg) => { disposeSubtree(cv, reg) },
  arr: () => {},
  text: () => {},
  hole: () => {},
}

/**
 * 移除旧输出的全部 DOM（Fragment 展开多节点 + Portal 容器）并做组件/ref 清理。
 * @returns 移除后应插入新节点的位置（范围后兄弟；null = append 末尾）
 * 真实 bug：Frag→div 类型切换只 replaceChild 锚点 → Fragment 其余节点（holes/标记/数组项）残留
 * （frag-native-switch trace 定位 2026-12；同逻辑覆盖 Frag→null/Portal→null）
 *
 * 分派：REMOVERS[classifyKind(oldInput)] 查表（kind → 移除行为——无 if/else 类型链）
 */
export function removeOldOutput(oldInput: VNodeChild, oldNode: Node | null, parent: Node, ctx: PatchCtx): Node | null {
  return REMOVERS[classifyKind(oldInput)](oldInput, oldNode, parent, ctx)
}

/** 移除状态机表（kind → 移除行为——单节点/范围/远程容器三类输出范围） */
export const REMOVERS: Record<VKind, (oldInput: VNodeChild, oldNode: Node | null, parent: Node, ctx: PatchCtx) => Node | null> = {
  /** 数组（隐式 Fragment/组件输出数组）——fragment-start..end 标记范围整体移除 */
  arr: (oldInput, oldNode, parent, ctx) => {
    const range = getOutputRange(oldInput, oldNode)
    if (range && range.length) {
      const ref = (range[range.length - 1] ?? oldNode)?.nextSibling ?? null
      for (const n of range) if (n.parentNode) n.parentNode.removeChild(n)
      return ref && ref.parentNode === parent ? ref : null
    }
    return removeNode(oldInput, oldNode, parent, ctx)
  },
  /** Fragment：标记范围移除 + 子树组件 dispose */
  frag: (oldInput, oldNode, parent, ctx) => {
    const ov = oldInput as VNode
    // 标记范围（start..end 含标记——统一协议；anchor = start 标记）
    const range = getOutputRange(ov, oldNode)
    const fragNodes = range ?? []
    // 范围后兄弟（fragment-end 之后）——移除前捕获（标记缺失时回退 oldNode 兄弟）
    const ref = (fragNodes[fragNodes.length - 1] ?? oldNode)?.nextSibling ?? null
    for (const n of fragNodes) if (n.parentNode) n.parentNode.removeChild(n)
    disposeSubtree(ov, ctx.registry)
    return ref && ref.parentNode === parent ? ref : null
  },
  /** Portal：递归清理 portal 内容的 ref（Modal root div 的 rootRef → unlockScroll；
   *  直接 removeChild 会跳过 ref(null) → 滚动锁泄漏 → body overflow 卡 hidden） */
  portal: (oldInput, _oldNode, _parent, ctx) => {
    const ov = oldInput as PortalVNode
    const remoteEl = ov._remoteEl
    try { callRefCleanupFor(ov.props?.children, ctx.registry) } catch (e) { console.error('[weifuwu] portal ref cleanup error', e) }
    remoteEl?.parentNode?.removeChild(remoteEl)
    return null
  },
  /** 组件：输出可能多节点（Fragment/数组）——经 _outputChild 递归移除（B5：
   *  只 dispose 锚点则输出其余节点残留；_outputChild 独立于 dispose 清空的 _child） */
  comp: (oldInput, oldNode, parent, ctx) => {
    const ov = oldInput as VNode
    const range = getOutputRange(ov, oldNode)
    disposeComponent(ov, ctx.registry)
    if (range && range.length > 1) {
      const ref = (range[range.length - 1] ?? oldNode)?.nextSibling ?? null
      for (const n of range) if (n.parentNode) n.parentNode.removeChild(n)
      return ref && ref.parentNode === parent ? ref : null
    }
    // 单节点输出 → 走单节点移除
    return removeNode(oldInput, oldNode, parent, ctx)
  },
  /** 原生元素：ref(null) 清理（Modal root div 移除时若不调 ref(null)——usePopup 的
   *  portalPanelRef 依赖它 unlockScroll——滚动锁泄漏 → body overflow 卡 hidden） */
  native: (oldInput, oldNode, parent, ctx) => {
    try { callRefCleanupFor(oldInput, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
    return removeNode(oldInput, oldNode, parent, ctx)
  },
  /** 文本/占位：单节点移除 */
  text: (oldInput, oldNode, parent, ctx) => removeNode(oldInput, oldNode, parent, ctx),
  hole: (oldInput, oldNode, parent, ctx) => removeNode(oldInput, oldNode, parent, ctx),
}

/** 单节点移除（返回移除后位置——nextSibling 或 null） */
function removeNode(_oldInput: VNodeChild, oldNode: Node | null, parent: Node, _ctx: PatchCtx): Node | null {
  const ref = oldNode?.nextSibling ?? null
  if (oldNode?.parentNode) oldNode.parentNode.removeChild(oldNode)
  return ref && ref.parentNode === parent ? ref : null
}

export interface PatchCtx {
  browser: any
  registry: import('./registry.ts').Registry
  /** 当前 ctx 版本号（三态 skip 版本比较：组件 _ctxVersion !== 当前版本 → 不 skip，
   *  强制重渲染——bumpCtxVersion 递增后所有组件重跑 renderFn，如 i18n 切换语言） */
  ctxVersion?: number
  /** force：跳过三态 skip（mountRoot.rerender 全量重跑用） */
  force?: boolean
}

/**
 * patchValue — 同步 diff 单一节点。
 * @returns newInput 的实际 DOM（null = 无 DOM）
 */
export function patchValue(
  parent: Node,
  oldNode: Node | null,
  oldInput: VNodeChild,
  newInput: VNodeChild,
  ctx: PatchCtx,
): Node | null {
  // x2y 状态机分派（vdom2 方案）：TRANSITIONS[oldKind][newKind] 查表——
  // 源类型驱动转换（同类型递归 / 异类型 renderValue + removeOldOutput）
  return x2y({ parent, oldNode, oldInput, newInput, ctx })
}
/** 属性 diff 状态机表（通道 → 更新/移除行为——patchProps 查表分派）：
 *  每个处理器自含「移除」（nv==null/false）与「更新」两态——值判断保留在处理器内。
 *  通道分类单一源 = propChannelOf（transform.ts——与 setProp 共用，禁止各路径各自判定） */
export const PROP_PATCHERS: Record<PropChannel, (el: Element, key: string, ov: any, nv: any) => void> = {
  /** event：先移除旧 handler 再绑定新（否则重复绑定累积——renderFn 重渲染产生新函数 → 每次
   *  patch 多一个监听 → 点击触发多次）；类型守卫：非函数值不抛错 */
  event: (el, key, ov, nv) => {
    const { type, capture } = eventTarget(key)
    if (typeof ov === 'function') el.removeEventListener(type, ov, capture ? { capture: true } : {})
    if (nv != null && nv !== false) {
      if (typeof nv !== 'function') {
        console.warn(`[weifuwu] event prop ${key} expects a function, got ${typeof nv} — ignored`)
      } else {
        el.addEventListener(type, nv, capture ? { capture: true } : {})
      }
    }
  },
  /** class：先清后设（无残留——字符串→对象形态切换时旧类名不残留） */
  class: (el, key, ov, nv) => {
    if (nv == null || nv === false) {
      el.removeAttribute('class')
    } else {
      el.className = ''
      setProp(el, key, nv)
    }
  },
  /** ref：nv 为 null → 卸载回调 ov(null)（ref 清理错误隔离） */
  ref: (el, key, ov, nv) => {
    if (nv == null || nv === false) {
      if (typeof ov === 'function') { try { ov(null) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
    } else {
      setProp(el, key, nv)
    }
  },
  /** value：移除 → 清空 value（property） */
  value: (el, key, ov, nv) => {
    if (nv == null || nv === false) { (el as HTMLInputElement).value = '' }
    else setProp(el, key, nv)
  },
  /** indeterminate：移除 → 半选态清除（delete 无效——property） */
  indeterminate: (el, key, ov, nv) => {
    if (nv == null || nv === false) { (el as HTMLInputElement).indeterminate = false }
    else setProp(el, key, nv)
  },
  /** 其余通道（enumerated/style/innerHTML/aria/default）：移除 → attribute 删除 + property 删除；
   *  更新 → setProp（通道内部分类在 setProp 层） */
  enumerated: patchPropRemoveOrSet,
  style: patchPropRemoveOrSet,
  innerHTML: patchPropRemoveOrSet,
  aria: patchPropRemoveOrSet,
  default: patchPropRemoveOrSet,
}

/** 默认属性 diff：移除（attribute + property 双删）或更新（setProp） */
function patchPropRemoveOrSet(el: Element, key: string, _ov: any, nv: any): void {
  if (nv == null || nv === false) {
    el.removeAttribute(key)
    try { delete (el as unknown as Record<string, unknown>)[key] } catch { /* noop */ }
  } else {
    setProp(el, key, nv)
  }
}

export function patchProps(el: Element, oldProps: Record<string, any>, newProps: Record<string, any>): void {
  // P-3 快速路径：引用级浅比较全等 → 零遍历直接返回（省 Set 构建 + 全量 key 遍历——
  // renderFn 重建的 vnode props 值大多没变，DOM 写已跳过但遍历不可跳过）
  const ka = Object.keys(oldProps)
  const kb = Object.keys(newProps)
  if (ka.length === kb.length) {
    let same = true
    for (let i = 0; i < ka.length; i++) {
      if (ka[i] !== kb[i] || oldProps[ka[i]] !== newProps[ka[i]]) { same = false; break }
    }
    if (same) return
  }
  const allKeys = new Set([...ka, ...kb])
  // input/select value 延后：先 patch 其余属性（min/max/step/options）再设 value——
  // range 先设 value 会被默认 min/max 夹紧（0/100），Set 遍历顺序不保证 → 显式延后
  let deferredValue: { ov: any; nv: any } | null = null
  for (const key of allKeys) {
    if (key === 'children' || key === 'key') continue
    const ov = oldProps[key]
    const nv = newProps[key]
    if (ov === nv) continue
    if (key === 'value' && (el instanceof HTMLSelectElement || el instanceof HTMLInputElement)) {
      deferredValue = { ov, nv }
      continue
    }
    // 属性通道状态机查表分派（通道判定单一源 propChannelOf——无 if/else 通道链）
    PROP_PATCHERS[propChannelOf(key)](el, key, ov, nv)
  }
  if (deferredValue) PROP_PATCHERS.value(el, 'value', deferredValue.ov, deferredValue.nv)
}

/**
 * patchChildren — 数组 diff。
 * @returns 每个新子项的 DOM 范围（Fragment 展开对齐）
 */
/** 多节点配对 diff（Fragment/数组项统一——2026-12 array2array）：
 *  展开 children（Fragment 项取 props.children；数组项传自身）→ patchChildren 递归。
 *  位置循环多节点分支与 fragToFrag（keyed/顶层入口）共用——多节点 diff 实现单点。
 *  oldRange = 标记范围（getOutputRange——start/end + fid 配对） */
export function arrayToArray(
  parent: Node,
  oldInput: VNodeChild | null,
  newInput: VNodeChild | null,
  ctx: PatchCtx,
  oldRange: Node[] | null,
): (Node | null)[] {
  // 构建后的 _child 优先（buildVNode 产物——组件已设 _render）；手写 vnode（未 build）fallback
  // props.children。原始 JSX children 里的组件未构建——diff 到它们 → renderComp 抛「not built」
  // （demo 搜索序列实测：fragToFrag/nativeToNative 递归 diff 原始 vnode）
  const oldCChildren = Array.isArray(oldInput) ? oldInput : (oldInput as VNode)?._child ?? (oldInput as VNode)?.props?.children ?? null
  const newCChildren = Array.isArray(newInput) ? newInput : (newInput as VNode)?._child ?? (newInput as VNode)?.props?.children ?? null
  return patchChildren(parent, oldCChildren, newCChildren, ctx, oldRange)
}

export function patchChildren(
  parent: Node,
  oldInput: VNodeChild | null,
  newInput: VNodeChild | null,
  ctx: PatchCtx,
  oldRange?: Node[] | null,
  anchorOut?: (Node | null)[],
): (Node | null)[] {
  // 过滤已删除（占位法替代）：数组上下文的无渲染值（false/null/true）由 renderValue 建占位节点——
  // DOM childNodes 与 children 数组同构（长度恒等），数组项原样参与 diff（用户 vnode 零 magic，
  // 规则表 §1/§3）。
  // 数组项 = 隐式 Fragment：保真用户结构（不展开——vnode 任何阶段以用户 JSX 为标准，规则表
  // §1-20）。old/new children 是外层数组（含数组项原样）；数组项在下方配对分支递归处理
  const oldChildren = arrayChildren(oldInput)
  const newChildren = arrayChildren(newInput)
  const source = oldRange ?? Array.from(parent.childNodes)
  if (traceEnabled('diff')) trace('diff', 'debug', '', `patchChildren parent=${nodeDesc(parent)} old=${kidsSeq(oldChildren)} new=${kidsSeq(newChildren)} dom=${childNodesSeq(parent)}`)

  // ── key 模式状态机（业务身份声明协议——框架不生成身份 key，design 归档） ──
  // 模式判定（keyModeOf）→ 状态转换（mixed → prepPos → keyed）→ 查表分派（KEY_DIFFERS）。
  // 三场景：unkeyed（位置身份）/ keyed（内容身份）/ mixed（无 key 项 pos: 显式接管后降级 keyed）
  // 数组项（隐式 Fragment）存在（新旧任一）→ 强制 unkeyed（外层位置配对——数组项无 key 身份，
  // 内层数组内部各自 keyed，层级独立。旧数组项在 keyed 分支无匹配会残留——[c,d,[e,f]]→[c,d]）
  const hasArrayItem = newChildren.some((c) => Array.isArray(c)) || oldChildren.some((c) => Array.isArray(c))
  const mode: KeyMode = hasArrayItem ? 'unkeyed' : keyModeOf(newChildren)
  emit({ session: '', machine: 'keys', nodeId: null, component: null, from: hasArrayItem ? 'unkeyed' : keyModeOf(newChildren), event: 'SELECT', to: mode, payload: () => ({ len: newChildren.length }), level: 'trace', ts: Date.now() })

  // A 级动态检测（业务身份声明协议）：长度变化 + 无 key 组件项 → dev error
  // （业务身份只有业务知道——框架提示而非静默错位；native/portal 豁免——无实例状态）
  // 去重：表单类静态字段数组（条件块尾部插入导致长度变化——字段位置实际稳定）会批量
  // 误报——同一数组上下文只报一次（module 级 Set——按数组长度签名）
  if (auditEnabled() && oldChildren.length !== newChildren.length) {
    const sig = `${newChildren.length}:${oldChildren.length}`
    if (!warnedDynamicArrays.has(sig)) {
      warnedDynamicArrays.add(sig)
      for (let i = 0; i < newChildren.length; i++) {
        const c = newChildren[i]
        if (c != null && typeof c === 'object' && !Array.isArray(c) && isComp(c as VNode) && (c as VNode).key == null) {
          console.error(
            `[vdom2/audit] 动态数组位置 ${i} 的组件缺少 key——列表增删/重排会错位组件实例状态。` +
              `请提供业务身份 key（如 key={item.id}）；无状态 native 项豁免。`,
          )
        }
      }
    }
  }
  // 数组项递归场景（oldRange 传入——数组项 vs 数组项配对分支）：旧数组项范围 = [start, 内容..., end] 标记。
  // keyed/allUnkeyed 新增分支必须插到范围内（end 标记前），否则新内容插到容器首/尾
  // （真实 bug：ARR(0)→ARR(2) 文件按钮跑到 Card children 最前——frag-arr-content-change trace 定位 2026-12）
  const arrEnd = oldRange && oldRange.length ? oldRange[oldRange.length - 1] : null
  // mixed 状态转换：无 key 项分配 pos:{i}（位置身份显式化——防 keyed 分支「移除旧+新建」重建
  // 固定结构（表头/行标签等）；portal 的 portalKey 不算用户 keyed（C1）——不分配、不 mutate）
  if (mode === 'mixed') {
    prepPos(newChildren)
    prepPos(oldChildren)
  }

  // oldNodes 映射：统一锚点推导——vnode 项 = _refNode（native=el / Frag=start 标记 /
  // 组件=输出首节点——渲染时已设，无需 _childAnchors 缓存）；数组项/文本/hole = source 位置。
  // 数组项递归传入的 oldRange 含边界标记（[start1, c, d, start2, e, f, end2, end1]）——
  // source[i] 索引与 oldChildren 内容项错位（标记占位 + 嵌套数组项内部节点）。
  // 剥离首尾标记得内容序列；数组项锚点 = 其 start 标记（k 推进不消费内部节点）
  const oldNodes: (Node | null)[] = (() => {
    let src = source
    if (src.length >= 2 && src[0]?.nodeType === 8 && (src[0] as Comment).nodeValue?.includes('fragment-start') &&
        src[src.length - 1]?.nodeType === 8 && (src[src.length - 1] as Comment).nodeValue?.includes('fragment-end')) {
      src = src.slice(1, -1)
    }
    const nodes: (Node | null)[] = []
    let k = 0
    for (let i = 0; i < oldChildren.length; i++) {
      const c = oldChildren[i]
      if (Array.isArray(c)) {
        // 数组项锚点 = start 标记；k 跳过多节点内部（start..end 宽度——getOutputRange 配对）
        const start = src[k] ?? null
        nodes.push(start)
        const range = getOutputRange(c, start)
        k += (range?.length ?? 1)
        continue
      }
      if (c == null || typeof c === 'boolean' || typeof c === 'string' || typeof c === 'number') { nodes.push(src[k] ?? null); k++; continue }
      const vn = c as VNode
      if (isPortal(vn)) { nodes.push((vn._remoteEl ?? null) as Node | null); continue }
      // 统一锚点：_refNode（渲染时已设——native=el / Frag=start 标记 / 组件=输出首节点）
      nodes.push(vn._refNode ?? src[k] ?? null)
      // 多节点宽度推进（Frag/组件——输出可能多节点，内部节点不消费 src——_childAnchors
      // 缓存删除后的等价替代）：getOutputRange 返回 start..end 宽度；单节点 null → +1
      if (typeof vn.type === 'function' || isFrag(vn)) {
        const range = getOutputRange(vn, vn._refNode ?? src[k] ?? null)
        k += (range?.length ?? 1)
      } else {
        k++
      }
    }
    return nodes
  })()

  // C1：remote（portal）的 portalKey 不算用户 keyed——[input(无key), portal] 走 unkeyed 按位置复用
  // （keyModeOf 已排除 portal）——查表分派：unkeyed/keyed 各自实现；mixed 已转换为 keyed
  return KEY_DIFFERS[mode]({ parent, oldChildren, newChildren, oldNodes, ctx, arrEnd, anchorOut })
}

/** 位置级 kind 分类（数组上下文——POS 位置转换表分派用）：
 *  - hole ：无渲染值（null/false/undefined/true——占位）
 *  - real ：单节点值（text/native/comp/portal）
 *  - multi：多节点输出（数组项 = 隐式 Fragment / 显式 Fragment） */
type PosKind = 'hole' | 'real' | 'multi'
function posKindOf(c: VNodeChild | null): PosKind {
  if (c == null || typeof c === 'boolean') return 'hole'
  if (Array.isArray(c)) return 'multi'
  if (c && typeof c === 'object' && isFrag(c as VNode)) return 'multi'
  return 'real'
}

/** 位置转换上下文（数组 diff 每位置——POS 表分派参数） */
interface PosState {
  parent: Node
  oldC: VNodeChild | null
  newC: VNodeChild
  oldNode: Node | null
  i: number
  oldNodes: (Node | null)[]
  newChildren: VNodeChild[]
  out: (Node | null)[]
  pushA: (n: Node | null) => void
  ctx: PatchCtx
}

/** 数组缩短裁剪（位置级值判断——数组长度语义，非类型转换）：多余旧项移除 + 组件 dispose */
function posRemoveOld(s: PosState): void {
  const { parent, oldC, oldNode: on, oldNodes, i, ctx, out, pushA } = s
  if (Array.isArray(oldC)) {
    if (traceEnabled('diff')) trace('diff', 'trace', '', `remove-arr-item i=${i} range=[${(getOutputRange(oldC, oldNodes[i]) ?? []).map(nodeDesc).join(' | ')}] before=${childNodesSeq(parent)}`)
    // 旧数组项（隐式 Fragment）整体移除：范围（含边界标记）+ 内层组件 dispose
    const range = getOutputRange(oldC, on)
    for (const n of range ?? []) n.parentNode?.removeChild(n)
    if (traceEnabled('diff')) trace('diff', 'trace', '', `remove-arr-item after=${childNodesSeq(parent)}`)
    for (const sub of oldC) {
      if (sub != null && typeof sub === 'object' && !Array.isArray(sub) && typeof (sub as VNode).type === 'function') {
        disposeComponent(sub as VNode, ctx.registry)
      }
    }
  } else if (oldC && typeof oldC === 'object' && !Array.isArray(oldC)) {
    if (typeof (oldC as VNode).type === 'function') disposeComponent(oldC as VNode, ctx.registry)
    else { try { callRefCleanupFor(oldC as VNode, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
    if (on?.parentNode) on.parentNode.removeChild(on)
  } else if (on?.parentNode) {
    on.parentNode.removeChild(on)
  }
  out.push(null)
  pushA(null)
}

/** 占位 ↔ 占位：nodeValue 直改（长度恒定——预捕获 source 索引全有效）或兜底插入 */
function posHoleHole(s: PosState): void {
  const { parent, newC, oldNode: on, i, oldNodes, out, pushA, ctx } = s
  const newHole = createHole(ctx.browser ?? createClientBrowser(), newC)
  if (on?.nodeType === 8) {
    if (newHole && on.nodeValue !== newHole.nodeValue) on.nodeValue = newHole.nodeValue
    out.push(on)
    pushA(on)
    return
  }
  // 旧位置无占位（异常/迁移场景）→ 兜底插入
  if (newHole && on?.parentNode) on.parentNode.replaceChild(newHole, on)
  else if (newHole) {
    // 超界新增 hole（旧 children 短于新——i 超出旧数组但 newC 是占位）：
    // 插到正确位置（next 推导）而非 append 末尾——Frag 标记化后 box 末尾可能是
    // tail（Frag-end 后）——append 会把 hole 塞到 Frag 范围外（错位）
    let next: Node | null = null
    for (let j = i + 1; j < oldNodes.length; j++) {
      const n = oldNodes[j]
      if (n && n.parentNode === parent) { next = n; break }
    }
    if (!next) {
      let last: Node | null = null
      for (let k = out.length - 1; k >= 0; k--) if (out[k]) { last = out[k]; break }
      if (last && last.parentNode === parent) next = last.nextSibling
    }
    if (next && next.parentNode === parent) parent.insertBefore(newHole, next)
    else parent.appendChild(newHole)
    out.push(newHole)
    pushA(newHole)
  } else {
    out.push(newHole)
    pushA(newHole)
  }
}

/** 占位 → 真实/多节点：渲染 + 插入（占位替换 / next-sibling 定位——旧 children 短于新） */
function posHoleReal(s: PosState): void {
  const { parent, newC, oldNode: oldHole, i, oldNodes, out, pushA, ctx } = s
  const node = renderValue(newC, ctx, ctx.browser ?? createClientBrowser(), String(i))
  if (node == null) { out.push(null); pushA(null); return }
  // 占位 → 真实：replaceChild（占位法下旧位置是注释节点——长度恒定，索引全有效）
  if (oldHole && oldHole.nodeType === 8 && oldHole.nodeValue?.includes('type=hole')) {
    // 空洞填充事件（空洞错位事故断言：占位按数组下标替换——childNodes 与 children 同构）
    emit({ session: '', machine: 'pos', nodeId: null, component: null, from: 'hole', event: 'HOLE_FILL', to: 'real', payload: () => ({ i, replaced: nodeDesc(oldHole) }), level: 'trace', ts: Date.now() })
    oldHole.parentNode?.replaceChild(node, oldHole)
    out.push(node)
    pushA(node)
    return
  }
  // 无占位（旧 children 短于新/尾部新增）→ 原 next-sibling 逻辑（位置正确）
  let next: Node | null = null
  for (let j = i + 1; j < oldNodes.length; j++) {
    const n = oldNodes[j]
    if (n && n.parentNode === parent) { next = n; break }
  }
  // Fragment 内新增：oldNodes 用完（旧 children 短于新）→ 优先用已处理项（out 尾部）的
  // nextSibling（连续新增按序插入）。
  // **坑（2026-12 搜索恢复实测）**：out 尾部 nextSibling === null = 「父末尾——append 正确」，
  // 不得再进入旧节点兜底——否则用旧节点（已被新插入项顶到前方）的 nextSibling 作插入点，
  // 后续新增全被插到首个新项前（[Button, Input…] 恢复时 Input 被挤到列表尾）。
  // 兜底（最后一个旧节点的 nextSibling——Fragment 尾节点后的兄弟 c）仅在 out 尾部不可用
  // （null/已移除）时执行。
  if (next == null) {
    let last: Node | null = null
    for (let k = out.length - 1; k >= 0; k--) if (out[k]) { last = out[k]; break }
    if (last && last.parentNode === parent) {
      next = last.nextSibling // null = 父末尾（append 正确）——不再覆盖
    } else {
      const l = oldNodes[oldNodes.length - 1]
      if (l && l.parentNode === parent) next = l.nextSibling
    }
  }
  if (next && next.parentNode === parent) parent.insertBefore(node, next)
  else parent.appendChild(node)
  // 插入点事件（machine=pos，payload 惰性）——append 串位事故断言的基础：
  // insertedBefore 指向刚插入的项 = 插入点解析错乱（搜索恢复实测）
  emit({ session: '', machine: 'pos', nodeId: null, component: null, from: 'hole', event: 'INSERT', to: 'real', payload: () => ({ i, insertedBefore: next ? nodeDesc(next) : 'END', node: nodeDesc(node) }), level: 'trace', ts: Date.now() })
  out.push(node)
  pushA(node)
}

/** 真实 → 占位：comp 走 removeOldOutput（B5 多节点）；native/text 走 dispose + replaceChild */
function posRealHole(s: PosState): void {
  const { parent, oldC, newC, oldNode: on, out, pushA, ctx } = s
  if (oldC && typeof oldC === 'object' && !Array.isArray(oldC) && typeof (oldC as VNode).type === 'function') {
    // 组件：输出可能多节点（Fragment/数组）——removeOldOutput 经 _outputChild 整体移除（B5）
    const h = compToHoleIn(parent, oldC, on, newC, ctx)
    out.push(h); pushA(h); return
  }
  const h = realToHoleIn(parent, oldC, on, newC, ctx)
  out.push(h); pushA(h)
}

/** 真实 → 多节点：移除旧输出范围（引用驱动——旧项可能是 Fragment/组件多节点，只 replaceChild
 *  锚点则残留——vdom2-matrix 矩阵 frag→arr 失败）+ 渲染数组项 */
function posRealMulti(s: PosState): void {
  const { parent, oldC, newC, oldNode: oldHole, i, out, pushA, ctx } = s
  const b = ctx.browser ?? createClientBrowser()
  const node = renderValue(newC, ctx, b, String(i))
  if (node == null) { out.push(null); pushA(null); return }
  const oldRange = oldC && typeof oldC === 'object' ? getOutputRange(oldC, oldHole) : null
  if (oldRange && oldRange.length > 1) {
    const ref = (oldRange[oldRange.length - 1] ?? oldHole)?.nextSibling ?? null
    for (const n of oldRange) if (n.parentNode) n.parentNode.removeChild(n)
    if (oldC && typeof oldC === 'object' && !Array.isArray(oldC)) {
      if (typeof (oldC as VNode).type === 'function') disposeComponent(oldC as VNode, ctx.registry)
      else { try { callRefCleanupFor(oldC as VNode, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
    }
    if (ref && ref.parentNode === parent) parent.insertBefore(node, ref)
    else parent.appendChild(node)
  } else if (oldHole?.parentNode) {
    oldHole.parentNode.replaceChild(node, oldHole)
  } else {
    parent.appendChild(node)
  }
  const inner = node.nodeType === 11 ? Array.from(node.childNodes) : [node]
  out.push(...inner)
  pushA(inner[0] ?? node)
}

/** 多节点 → 占位：移除整范围（start..end 标记 + 内容）+ 组件 dispose + 插入 hole */
function posMultiHole(s: PosState): void {
  const { parent, oldC, newC, oldNode: on, out, pushA, ctx } = s
  const h = multiToHoleIn(parent, oldC, on, newC, ctx)
  out.push(h); pushA(h)
}

/** 多节点 → 真实：移除旧范围（标记 + fid 配对——Frag/数组统一；dispose 组件）+ 渲染新 */
function posMultiReal(s: PosState): void {
  const { parent, oldC, newC, oldNode, i, oldNodes, out, pushA, ctx } = s
  const b = ctx.browser ?? createClientBrowser()
  const range = getOutputRange(oldC, oldNode)
  if (traceEnabled('diff')) trace('diff', 'debug', '', `multi-remove i=${i} range=${range ? range.map(nodeDesc).join(' | ') : 'null'}`)
  for (const n of range ?? []) {
    n.parentNode?.removeChild(n)
  }
  // 多节点内组件 dispose（范围节点已移除——组件状态清理）
  for (const sub of arrayChildren((oldC as VNode)?.props?.children)) {
    if (sub != null && typeof sub === 'object' && !Array.isArray(sub) && typeof (sub as VNode).type === 'function') {
      disposeComponent(sub as VNode, ctx.registry)
    }
  }
  const node = renderValue(newC, ctx, b, String(i))
  if (node == null) { out.push(null); pushA(null); return }
  // 插入到数组项范围后的位置（下一个锚点前）——数组项首节点已移除，用范围后首个节点作参考
  const anchor = oldNodes[i + 1] ?? null
  if (anchor?.parentNode) anchor.parentNode.insertBefore(node, anchor)
  else parent.appendChild(node)
  out.push(node)
  pushA(node)
}

/** 多节点 vs 多节点：递归（旧范围 = 标记范围——anchor = start 标记；arrayToArray 统一实现） */
function posMultiMulti(s: PosState): void {
  const { parent, oldC, newC, oldNode, oldNodes, i, out, pushA, ctx } = s
  const range = getOutputRange(oldC, oldNode)
  const inner = arrayToArray(parent, oldC, newC, ctx, range)
  out.push(...inner)
  // 锚点 = 旧 start 标记（保留在 DOM——patchChildren 剥离首尾不触碰）；数组项首帧同款
  pushA(oldNodes[i] ?? inner[0] ?? null)
}

/** 真实 → 真实：disposed 兜底（I1）→ patchValue（x2y——引用短路 V3-3a 已前置循环层） */
function posRealReal(s: PosState): void {
  const { parent, oldC, newC, oldNode, i, out, pushA, ctx } = s
  // I1 兜底：disposed 组件在 diff（剪枝缓存失效——portal 内容独立 dispose）——
  // 占位 + 提示（audit 报错暴露；生产 warn 恢复——父树下一轮 canReuse 拒绝 → 重建）
  if (newC && typeof newC === 'object' && !Array.isArray(newC) &&
      typeof (newC as VNode).type === 'function' && (newC as VNode)._lifecycle === 'disposed') {
    const hole = disposedFallback(parent, oldNode, ctx, componentName((newC as VNode).type))
    out.push(hole)
    pushA(hole)
    return
  }
  const node = patchValue(parent, oldNode, oldC, newC, ctx)
  if (traceEnabled('diff')) trace('diff', 'trace', '', `after-patch i=${i} new=${vnDesc(newC)} node=${nodeDesc(node)} dom=${childNodesSeq(parent)}`)
  // Fragment 项展开全部 childNodes（patchValue 只返回锚点——多节点 Fragment 漏收）
  const collected = collectChildNodes(newC, node)
  out.push(...collected)
  pushA(collected[0] ?? node ?? null)
}

// ── 共享移除 helper（unkeyed POS / keyed 新增分支共用——移除语义单点） ──

/** 多节点项（数组项/ Fragment）→ 占位：移除整范围（标记 + fid 配对）+ 组件 dispose + 插入 hole */
function multiToHoleIn(parent: Node, oldC: VNodeChild | null, on: Node | null, newC: VNodeChild, ctx: PatchCtx): Node | null {
  const newHole = createHole(ctx.browser ?? createClientBrowser(), newC)
  const range = getOutputRange(oldC, on)
  const ref = ((range ?? [])[range?.length ? range.length - 1 : 0] ?? on)?.nextSibling ?? null
  for (const n of range ?? []) n.parentNode?.removeChild(n)
  for (const sub of arrayChildren((oldC as VNode)?.props?.children)) {
    if (sub != null && typeof sub === 'object' && !Array.isArray(sub) && typeof (sub as VNode).type === 'function') {
      disposeComponent(sub as VNode, ctx.registry)
    }
  }
  if (newHole && ref && ref.parentNode === parent) parent.insertBefore(newHole, ref)
  else if (newHole) parent.appendChild(newHole)
  return newHole
}

/** 组件 → 占位：removeOldOutput 经 _outputChild 整体移除（B5——输出多节点不残留） */
function compToHoleIn(parent: Node, oldC: VNodeChild | null, on: Node | null, newC: VNodeChild, ctx: PatchCtx): Node | null {
  const newHole = createHole(ctx.browser ?? createClientBrowser(), newC)
  const ref = removeOldOutput(oldC, on, parent, ctx)
  if (newHole && ref) parent.insertBefore(newHole, ref)
  else if (newHole) parent.appendChild(newHole)
  return newHole
}

/** 普通对象/单节点 → 占位：dispose/ref 清理 + replaceChild（不 removeChild——childNodes 长度恒定） */
function realToHoleIn(parent: Node, oldC: VNodeChild | null, on: Node | null, newC: VNodeChild, ctx: PatchCtx): Node | null {
  const newHole = createHole(ctx.browser ?? createClientBrowser(), newC)
  if (oldC && typeof oldC === 'object' && !Array.isArray(oldC)) {
    if (typeof (oldC as VNode).type === 'function') {
      disposeComponent(oldC as VNode, ctx.registry)
    } else {
      try { callRefCleanupFor(oldC as VNode, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
    }
  }
  if (newHole && on?.parentNode) on.parentNode.replaceChild(newHole, on)
  else if (newHole) parent.appendChild(newHole)
  return newHole
}

/** 位置级 (oldKind, newKind) 转换状态机表（数组上下文——与 x2y 同构的矩阵分派） */
export const POS: Record<PosKind, Record<PosKind, (s: PosState) => void>> = {
  hole: { hole: posHoleHole, real: posHoleReal, multi: posHoleReal },
  real: { hole: posRealHole, real: posRealReal, multi: posRealMulti },
  multi: { hole: posMultiHole, real: posMultiReal, multi: posMultiMulti },
}

/** unkeyed 模式：按位置 patch（不移动 DOM——位置身份）。
 *  分派：数组缩短裁剪/引用短路（值判断）→ POS[posKindOf(oldC)][posKindOf(newC)] 查表 */
function diffUnkeyed(s: KeyDiffState): (Node | null)[] {
  const { parent, oldChildren, newChildren, oldNodes, ctx, anchorOut } = s
  const len = Math.max(oldChildren.length, newChildren.length)
  const out: (Node | null)[] = []
  const pushA = (n: Node | null) => { if (anchorOut) anchorOut.push(n) }
  for (let i = 0; i < len; i++) {
    const oldC = i < oldChildren.length ? oldChildren[i] : null
    const newC = i < newChildren.length ? newChildren[i] : null
    // 数组长度差（i 超出新数组——newC=null 来自 len=max）：多余旧项 → 移除（不是占位——
    // 新数组没有该位置；占位法"长度恒定"只适用于数组内 false/null（长度不变时互转））
    if (i >= newChildren.length) {
      posRemoveOld({ parent, oldC, newC, oldNode: oldNodes[i], i, oldNodes, newChildren, out, pushA, ctx })
      continue
    }
    // V3-3a：引用短路——newC === oldC（vnode 引用相等 = 子树未变——JS 对象不可变约定）
    // → 跳过 patchValue 全递归（未变项零开销）。命中场景：renderFn 返回稳定数组引用
    // （props.items 原样透传）+ build 同步构建的 native 项（引用保持）；组件项剪枝
    // 已由 patchValue 组件 skip 覆盖（此处短路仅原生项）。canReuse（I3）：disposed 的
    // 旧 vnode 不能短路（已被清理——DOM 已移除，短路会跳过错位）
    if (oldC != null && typeof oldC === 'object' && !Array.isArray(oldC) &&
        newC != null && typeof newC === 'object' && !Array.isArray(newC) &&
        newC === oldC && canReuse(oldC as VNode)) {
      out.push(oldNodes[i])
      pushA(oldNodes[i])
      continue
    }
    // 位置级 (oldKind, newKind) 转换状态机查表分派（无 if/else 类型链）
    const posFn = POS[posKindOf(oldC)][posKindOf(newC)]
    emit({ session: '', machine: 'pos', nodeId: null, component: null, from: posKindOf(oldC), event: posFn.name, to: posKindOf(newC), payload: () => ({ i }), level: 'trace', ts: Date.now() })
    posFn({ parent, oldC, newC, oldNode: oldNodes[i], i, oldNodes, newChildren, out, pushA, ctx })
  }
  return out
}

/** keyed 模式：按 key 匹配（keyMap——内容身份；movedKeys 跟踪 + 位置校正移动） */
function diffKeyed(s: KeyDiffState): (Node | null)[] {
  const { parent, oldChildren, newChildren, oldNodes, ctx, anchorOut, arrEnd } = s
  // keyed diff
  const oldKeyMap = new Map<string, { vnode: VNode; nodes: Node[]; index: number }>()
  oldChildren.forEach((c, i) => {
    const k = getKey(c)
    if (k !== null && c && typeof c === 'object' && !Array.isArray(c)) {
      oldKeyMap.set(k, { vnode: c as VNode, nodes: [oldNodes[i] ?? null].filter(Boolean) as Node[], index: i })
    }
  })
  const out: (Node | null)[] = []
  const movedKeys = new Set<string>()
  const pushA = (n: Node | null) => { if (anchorOut) anchorOut.push(n) }
  // 位置校正锚点：保证最终 DOM 顺序 = newChildren 顺序（keyed 移动必须 insertBefore）
  let lastDom: Node | null = null
  newChildren.forEach((c, i) => {
    const k = getKey(c)
    const newV = c as VNode
    if (k !== null && oldKeyMap.has(k)) {
      const entry = oldKeyMap.get(k)!
      const oldNode = entry.nodes[0] ?? null
      movedKeys.add(k)
      // I1 兜底：disposed 组件（同 unkeyed 分支——剪枝缓存失效）
      if (newV && typeof newV === 'object' && typeof newV.type === 'function' && newV._lifecycle === 'disposed') {
        const hole = disposedFallback(parent, oldNode, ctx, componentName(newV.type))
        out.push(hole)
        pushA(hole)
        if (hole) lastDom = hole
        return
      }
      const node = patchValue(parent, oldNode, entry.vnode, newV, ctx)
      const collected = collectChildNodes(newV, node)
      // 位置校正：keyed 项的所有节点必须位于 lastDom 之后（keyed 重排——旧实现只 patch 不移动 DOM）
      // 多节点集合（Fragment/数组项展开）必须**整体移动**——只移动最后一个节点会拆散集合
      // （真实 bug：Card 内三元 Fragment 切换后 edit-plain 被挤到尾部——keyed-correct trace 定位 2026-12；
      //   判断也用集合首节点：原逻辑用 last.previousSibling 比较——集合内 prev 永远 ≠ lastDom → 误触发移动）
      const first = collected[0] ?? node
      const last = collected[collected.length - 1] ?? node
      if (first && first.parentNode === parent && lastDom && first.previousSibling !== lastDom) {
        if (traceEnabled('diff')) trace('diff', 'debug', '', `keyed-correct i=${i} k=${k} move=[${collected.map(nodeDesc).join(' | ')}] after=${nodeDesc(lastDom)} before=${childNodesSeq(parent)}`)
        // 整体移动到 lastDom 之后（ref 固定 = lastDom.nextSibling——逐节点 insertBefore 保持集合内顺序）
        const ref = lastDom.nextSibling
        for (const n of collected) {
          if (n && n.parentNode === parent) parent.insertBefore(n, ref)
        }
        if (traceEnabled('diff')) trace('diff', 'debug', '', `keyed-correct after=${childNodesSeq(parent)}`)
      }
      out.push(...collected)
      pushA(collected[0] ?? node ?? null)
      if (last) lastDom = last
    } else {
      // 新增/占位项（无 key 匹配）——kind 分派查表（KEYED_NEW：hole/portal/real——
      // 占位项含「旧项→占位」的 oldKind 子分派；portal 复用容器 patch；real 渲染 + P-4 插入）
      const kref: { current: Node | null } = { current: lastDom }
      KEYED_NEW[keyedNewKind(c)]({ parent, oldChildren, newChildren, oldNodes, ctx, out, pushA, arrEnd, c, i }, kref)
      lastDom = kref.current
    }
  })
  // 删除未移动的旧节点——key 状态分派查表（REMOVE_OLD[oldKeyStateOf]——无 if/else 分派链）
  oldChildren.forEach((c, i) => {
    REMOVE_OLD[oldKeyStateOf(getKey(c), movedKeys)](parent, c, i, oldNodes, ctx, newChildren.length)
  })
  return out
}

/** 旧项清理 key 状态（keyed 删除遍历——REMOVE_OLD 分派用） */
type OldKeyState = 'stale-keyed' | 'unkeyed' | 'moved'
function oldKeyStateOf(k: string | null, movedKeys: Set<string>): OldKeyState {
  if (k === null) return 'unkeyed'
  return movedKeys.has(k) ? 'moved' : 'stale-keyed'
}

/** 旧项清理状态机表（key 状态 → 移除/保留行为——无 if/else 分派链） */
const REMOVE_OLD: Record<OldKeyState, (parent: Node, c: VNodeChild, i: number, oldNodes: (Node | null)[], ctx: PatchCtx, newLen: number) => void> = {
  /** 已匹配移动——保留（keyed 位置校正已处理） */
  moved: () => {},
  /** 未匹配 keyed 项：范围移除（多节点）或单节点移除（引用驱动——只 removeChild 锚点则残留） */
  'stale-keyed': removeStaleKeyed,
  /** 无 key 项：占位保留（占位法长度恒定）；非占位/超界 → 移除 */
  unkeyed: removeUnkeyedStale,
}

/** 未匹配 keyed 旧项移除（多节点旧项按输出范围移除——keyed 分支 frag→text/comp 矩阵失败教训） */
function removeStaleKeyed(parent: Node, c: VNodeChild, i: number, oldNodes: (Node | null)[], ctx: PatchCtx): void {
  const range = c && typeof c === 'object' && !Array.isArray(c) ? getOutputRange(c, oldNodes[i]) : null
  if (traceEnabled('diff')) trace('diff', 'trace', '', `keyed-delete i=${i} k=${getKey(c)} range=${range?.length ?? 0} oldNode=${nodeDesc(oldNodes[i])}`)
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    if (typeof (c as VNode).type === 'function') disposeComponent(c as VNode, ctx.registry)
    else { try { callRefCleanupFor(c as VNode, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
  }
  removeRangeOrNode(range, oldNodes[i])
}

/** 无 key 旧项：占位保留（占位法：长度恒定——占位↔占位/占位→真实已由新建分支处理）；
 *  仅当 new 侧无对应位置（数组缩短 i >= newChildren.length）或非占位项（文本/真实）才删除。
 *  注意：不能用 newC == null 判断缩短——数组内 null 本身是占位项（有位置），
 *  newC=null 是「占位↔占位」需保留；数组缩短是 i 超界（Chat 回复条缺失根因） */
function removeUnkeyedStale(parent: Node, c: VNodeChild, i: number, oldNodes: (Node | null)[], ctx: PatchCtx, newLen: number): void {
  const on = oldNodes[i]
  const isHole = on?.nodeType === 8 && on.nodeValue?.includes('type=hole')
  if (isHole && i < newLen) return // 占位保留（占位法长度恒定）
  if (c && typeof c === 'object' && !Array.isArray(c)) {
    if (typeof (c as VNode).type === 'function') disposeComponent(c as VNode, ctx.registry)
    else { try { callRefCleanupFor(c as VNode, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
  }
  const range = c && typeof c === 'object' && !Array.isArray(c) ? getOutputRange(c, on) : null
  removeRangeOrNode(range, on)
}

/** 移除范围（多节点）或单节点（值判断——range 有值则整体移除；单节点带 parentNode 守卫） */
function removeRangeOrNode(range: Node[] | null, on: Node | null): void {
  if (range && range.length > 1) {
    for (const n of range) if (n.parentNode) n.parentNode.removeChild(n)
  } else {
    if (on?.parentNode) on.parentNode.removeChild(on)
  }
}

/** keyed 新增项 kind 分类（无 key 匹配的占位/portal/普通项——KEYED_NEW 分派用） */
type KeyedNewKind = 'hole' | 'portal' | 'real'
function keyedNewKind(c: VNodeChild): KeyedNewKind {
  if (c == null || typeof c === 'boolean') return 'hole'
  if (c && typeof c === 'object' && !Array.isArray(c) && isPortal(c as VNode)) return 'portal'
  return 'real'
}

/** keyed 新增上下文（KEYED_NEW 分派参数） */
interface KeyedNewState {
  parent: Node
  oldChildren: VNodeChild[]
  newChildren: VNodeChild[]
  oldNodes: (Node | null)[]
  ctx: PatchCtx
  out: (Node | null)[]
  pushA: (n: Node | null) => void
  arrEnd: Node | null
  c: VNodeChild
  i: number
}

/** keyed 新增分派状态机表（kind → 处理——无 if/else 类型链） */
export const KEYED_NEW: Record<KeyedNewKind, (s: KeyedNewState, lastRef: { current: Node | null }) => void> = {
  /** 占位项（false/null/true，无 key——规则表 §3 豁免）：位置对齐（占位↔占位 / 真实→占位） */
  hole: keyedNewHole,
  /** portal：必须走 patchValue——复用旧容器 patch 内容（v1 patchPortal 语义——否则每次
   *  render renderValue 新建容器 → Popover 内容（Editor table grid）整体重建 → 闪烁） */
  portal: keyedNewPortal,
  /** 普通项：渲染 + P-4 单次插入（lastDom 链 / 数组项锚点 / 头部） */
  real: keyedNewReal,
}

/** 占位项：占位↔占位（nodeValue 直改）或真实/多节点→占位（共享 POS 移除 helper） */
function keyedNewHole(s: KeyedNewState, lastRef: { current: Node | null }): void {
  const { parent, oldChildren, oldNodes, ctx, out, pushA, c, i } = s
  const oldC = oldChildren[i] ?? null
  const on = oldNodes[i] ?? null
  const ok = posKindOf(oldC)
  if (ok === 'hole') {
    // 占位 ↔ 占位：内容更新（nodeValue 直改，长度恒定）
    const hole = createHole(ctx.browser ?? createClientBrowser(), c)
    if (on?.nodeType === 8) {
      if (hole && on.nodeValue !== hole.nodeValue) on.nodeValue = hole.nodeValue
      out.push(on)
      pushA(on)
      if (on) lastRef.current = on
    } else {
      if (hole && on?.parentNode) on.parentNode.replaceChild(hole, on)
      else if (hole) parent.appendChild(hole)
      out.push(hole)
      pushA(hole)
      if (hole) lastRef.current = hole
    }
    return
  }
  // 真实/多节点 → 占位（与 unkeyed POS 共享移除 helper——移除语义单点）
  const h = ok === 'multi' ? multiToHoleIn(parent, oldC, on, c, ctx)
    : (oldC && typeof oldC === 'object' && !Array.isArray(oldC) && typeof (oldC as VNode).type === 'function'
      ? compToHoleIn(parent, oldC, on, c, ctx)
      : realToHoleIn(parent, oldC, on, c, ctx))
  out.push(h)
  pushA(h)
  if (h) lastRef.current = h
}

/** portal 新增：patchValue（portal→portal 复用容器——旧容器 patch 内容，不重建） */
function keyedNewPortal(s: KeyedNewState, lastRef: { current: Node | null }): void {
  const { parent, oldChildren, oldNodes, ctx, out, pushA, c, i } = s
  const newV = c as VNode
  const oldC = oldChildren[i] ?? null
  const node = patchValue(parent, oldNodes[i] ?? null, oldC, newV, ctx)
  const collected = collectChildNodes(newV, node)
  out.push(...collected)
  pushA(collected[0] ?? node ?? null)
  const last = collected[collected.length - 1] ?? node
  if (last) lastRef.current = last
}

/** 普通项新增：渲染 + 插入（占位替换 / P-4 lastDom 链单次插入） */
function keyedNewReal(s: KeyedNewState, lastRef: { current: Node | null }): void {
  const { parent, oldNodes, ctx, out, pushA, arrEnd, c, i } = s
  const newV = c as VNode
  const node = renderValue(newV, ctx, ctx.browser ?? createClientBrowser())
  out.push(node)
  pushA(node ?? null)
  if (node != null) {
    const oldHole = oldNodes[i]
    // 占位 → 真实：replaceChild（§5 占位↔真实——Alert 顶替 false 位置，长度恒定）
    if (oldHole && oldHole.nodeType === 8 && oldHole.nodeValue?.includes('type=hole')) {
      oldHole.parentNode?.replaceChild(node, oldHole)
      lastRef.current = node
    } else {
      // P-4：新增节点单次插入——直接插到正确位置（不 append 末尾再校正）
      // lastDom 存在 → 插到已处理链尾后（中间/尾部插入：1 次写）
      // lastDom 为 null（列表头新增）→ 优先数组项递归锚点（end 标记前——ARR(0)→ARR(2)
      //   新增内容必须留在旧数组项范围内，否则插到容器最前）；无锚点 → 插到第一个旧节点前
      //   （头部插入：1 次写——旧实现 append 末尾导致后续所有匹配项位置校正 insertBefore 移动——
      //   100 行头部插入 = 103 次 DOM 写，perf 基准实锤）
      if (lastRef.current) parent.insertBefore(node, lastRef.current.nextSibling)
      else if (arrEnd && arrEnd.parentNode === parent) parent.insertBefore(node, arrEnd)
      else parent.insertBefore(node, parent.firstChild)
      lastRef.current = node
    }
  }
}
// ── key 模式状态机（业务身份声明协议——design 归档） ──

/** 数组 diff 上下文（unkeyed/keyed 共享——状态机分派参数） */
export interface KeyDiffState {
  parent: Node
  oldChildren: VNodeChild[]
  newChildren: VNodeChild[]
  oldNodes: (Node | null)[]
  ctx: PatchCtx
  arrEnd: Node | null
  anchorOut?: (Node | null)[]
}

/** mixed → keyed 状态转换：无 key 项分配 pos:{i}（位置身份显式化——防 keyed 分支
 *  「移除旧+新建」重建固定结构；portal 的 portalKey 不算用户 keyed（C1）——不分配） */
export function prepPos(children: VNodeChild[]): void {
  for (let i = 0; i < children.length; i++) {
    const c = children[i]
    if (c && typeof c === 'object' && !Array.isArray(c) && getKey(c) === null) (c as VNode).key = `pos:${i}`
  }
}

/** I1 兜底：disposed 组件在 diff（剪枝缓存失效——portal 内容独立 dispose 打破
 *  「父非 disposed ⟹ 子树全非 disposed」）——占位 + 提示。
 *  audit 开启 → console.error（暴露缺陷）；生产 → console.warn（占位兜底，
 *  父树下一轮 canReuse 深检查拒绝 → 重建恢复） */
function disposedFallback(parent: Node, oldNode: Node | null, ctx: PatchCtx, name: string): Node | null {
  if (auditEnabled()) {
    console.error(`[vdom2/audit] I1 违反：diff 收到 disposed 组件 ${name}——剪枝缓存失效（portal 内容独立 dispose）——父树将重建`)
  } else {
    console.warn(`[vdom2] disposed 组件 ${name} 在 diff——剪枝缓存失效——父树重建中（占位兜底）`)
  }
  const hole = createHole(ctx.browser ?? createClientBrowser(), null)
  if (hole == null) return null // createHole 类型可 null（实际浏览器 createComment 恒有值）
  const on = oldNode
  if (on) {
    const p = on.parentNode
    if (p) p.replaceChild(hole, on)
    else parent.appendChild(hole)
  } else {
    parent.appendChild(hole)
  }
  return hole
}

/** key diff 策略状态机：KeyMode → 实现（查表分派——与 x2y 转换状态机同构）
 *  - unkeyed：位置身份——按位置 patch（不移动 DOM）
 *  - keyed  ：内容身份——按 key 匹配（keyMap + 位置校正）
 *  - mixed  ：状态转换 prepPos（无 key 项 → pos:{i}）→ 降级 keyed */
export const KEY_DIFFERS: Record<KeyMode, (s: KeyDiffState) => (Node | null)[]> = {
  unkeyed: diffUnkeyed,
  keyed: diffKeyed,
  mixed: (s) => { prepPos(s.newChildren); prepPos(s.oldChildren); return diffKeyed(s) },
}
