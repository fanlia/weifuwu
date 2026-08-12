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
import { Fragment, Portal, arrayChildren, isFrag, isComp, isNative, isPortal } from '../vnode.ts'
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
import { setProp, EVENT_RE, createHole, eventTarget } from './transform.ts'
import { trace, traceEnabled, kidsSeq, vnDesc, nodeDesc, childNodesSeq } from './trace.ts'
import { getOutputRange, type PatchState } from './kind.ts'


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
    if (typeof cv.type === 'function') disposeComponent(cv, registry)
    else if (cv.type === Fragment || typeof cv.type === 'string' || typeof cv.type === 'symbol') disposeSubtree(cv, registry)
  }
}

/**
 * 移除旧输出的全部 DOM（Fragment 展开多节点 + Portal 容器）并做组件/ref 清理。
 * @returns 移除后应插入新节点的位置（范围后兄弟；null = append 末尾）
 * 真实 bug：Frag→div 类型切换只 replaceChild 锚点 → Fragment 其余节点（holes/标记/数组项）残留
 * （frag-native-switch trace 定位 2026-12；同逻辑覆盖 Frag→null/Portal→null）
 */
export function removeOldOutput(oldInput: VNodeChild, oldNode: Node | null, parent: Node, ctx: PatchCtx): Node | null {
  let ref: Node | null = null
  if (Array.isArray(oldInput)) {
    // 数组（隐式 Fragment/组件输出数组）——fragment-start..end 标记范围整体移除
    // （vdom2-matrix：comparr→comp 残留——旧版只移除锚点）
    const range = getOutputRange(oldInput, oldNode)
    if (range && range.length) {
      ref = (range[range.length - 1] ?? oldNode)?.nextSibling ?? null
      for (const n of range) if (n.parentNode) n.parentNode.removeChild(n)
      return ref && ref.parentNode === parent ? ref : null
    }
    if (oldNode?.parentNode) oldNode.parentNode.removeChild(oldNode)
    return oldNode?.nextSibling ?? null
  }
  if (oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput)) {
    const ov = oldInput as VNode
    if (isFrag(ov)) {
      // 标记范围（start..end 含标记——统一协议；anchor = start 标记）
      const range = getOutputRange(ov, oldNode)
      const fragNodes = range ?? []
      // 范围后兄弟（fragment-end 之后）——移除前捕获（标记缺失时回退 oldNode 兄弟）
      ref = (fragNodes[fragNodes.length - 1] ?? oldNode)?.nextSibling ?? null
      for (const n of fragNodes) if (n.parentNode) n.parentNode.removeChild(n)
      disposeSubtree(ov, ctx.registry)
      return ref && ref.parentNode === parent ? ref : null
    }
    if (isPortal(ov)) {
      // 递归清理 portal 内容的 ref（Modal root div 的 rootRef → unlockScroll；
      // 直接 removeChild 会跳过 ref(null) → 滚动锁泄漏 → body overflow 卡 hidden）
      const remoteEl = ov._remoteEl
      try { callRefCleanupFor(ov.props?.children, ctx.registry) } catch (e) { console.error('[weifuwu] portal ref cleanup error', e) }
      remoteEl?.parentNode?.removeChild(remoteEl)
      return null
    }
    if (typeof ov.type === 'function') {
      // 组件：输出可能多节点（Fragment/数组）——经 _outputChild 递归移除（B5：
      // 只 dispose 锚点则输出其余节点残留；_outputChild 独立于 dispose 清空的 _child）
      const range = getOutputRange(ov, oldNode)
      disposeComponent(ov, ctx.registry)
      if (range && range.length > 1) {
        ref = (range[range.length - 1] ?? oldNode)?.nextSibling ?? null
        for (const n of range) if (n.parentNode) n.parentNode.removeChild(n)
        return ref && ref.parentNode === parent ? ref : null
      }
      // 单节点输出 → 走下方锚点移除
    } else {
      // 原生元素：ref(null) 清理（Modal root div 移除时若不调 ref(null)——usePopup 的
      // portalPanelRef 依赖它 unlockScroll——滚动锁泄漏 → body overflow 卡 hidden）
      try { callRefCleanupFor(ov, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
    }
  }
  ref = oldNode?.nextSibling ?? null
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
  for (const key of allKeys) {
    if (key === 'children' || key === 'key') continue
    const ov = oldProps[key]
    const nv = newProps[key]
    if (ov === nv) continue
    if (EVENT_RE.test(key)) {
      // 事件函数引用变化：先移除旧 handler 再绑定新（否则重复绑定累积——
      // renderFn 重渲染产生新函数 → 每次 patch 多一个监听 → 点击触发多次）
      const { type, capture } = eventTarget(key)
      if (typeof ov === 'function') el.removeEventListener(type, ov, capture ? { capture: true } : {})
      // 类型守卫：非函数值不抛错（once/only 等 on 开头非事件属性由 EVENT_RE 排除）
      if (nv != null && nv !== false) {
        if (typeof nv !== 'function') {
          console.warn(`[weifuwu] event prop ${key} expects a function, got ${typeof nv} — ignored`)
        } else {
          el.addEventListener(type, nv, capture ? { capture: true } : {})
        }
      }
      continue
    }
    if (key === 'class' || key === 'className') {
      // 规则表 §2 class：先清后设（无残留——字符串→对象形态切换时旧类名不残留）
      if (nv == null || nv === false) {
        el.removeAttribute('class')
      } else {
        el.className = ''
        setProp(el, key, nv)
      }
      continue
    }
    if (nv == null || nv === false) {
      // 移除
      if (key === 'class' || key === 'className') { el.removeAttribute('class') }
      else if (EVENT_RE.test(key)) { el.removeEventListener(key.slice(2).toLowerCase(), ov) }
      else if (key === 'ref') { if (typeof ov === 'function') { try { ov(null) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } } }
      else if (key === 'value') { (el as HTMLInputElement).value = '' }
      else if (key === 'indeterminate') { (el as HTMLInputElement).indeterminate = false }  // 半选态清除（delete 无效——property）
      else { el.removeAttribute(key); try { delete (el as unknown as Record<string, unknown>)[key] } catch {} }
      continue
    }
    setProp(el, key, nv)
  }
}

/**
 * patchChildren — 数组 diff。
 * @returns 每个新子项的 DOM 范围（Fragment 展开对齐）
 */
/** 数组项（隐式 Fragment）DOM 范围。
 *  锚点是 fragment-start 注释（数组项渲染时写入边界标记）→ 范围 = start..fragment-end 含标记；
 *  end 配对用同 depth（嵌套数组项 [c,d,[e,f]] 的 end 属于内层——外层 start 必须跳过内层
 *  end 找到自己的——否则移除/对齐切错范围）。非数组项（单节点锚点）→ 自身到下一锚点前。
 *  标记持久化让数组项边界在 DOM 可见——移动/移除/对齐精确（替代纯 nextSibling 链推导） */
function rangeFor(anchors: (Node | null)[], i: number, parent: Node): Node[] {
  const start = anchors[i]
  if (!start) return []
  if (start.nodeType === 8 && start.nodeValue?.includes('type=fragment-start')) {
    const out: Node[] = [start]
    // end 配对用同 fid（start/end 共享数组项唯一 id——嵌套数组项 fid 不同不干扰；
    // 无 fid（旧标记）兜底取首个 end）
    const startFid = /fid=([^\s"]+)/.exec(start.nodeValue)?.[1] ?? ''
    let n: Node | null = start.nextSibling
    while (n) {
      out.push(n)
      if (n.nodeType === 8 && n.nodeValue?.includes('type=fragment-end')) {
        const endFid = /fid=([^\s"]+)/.exec(n.nodeValue)?.[1] ?? startFid
        if (endFid === startFid) break
      }
      n = n.nextSibling
    }
    return out
  }
  const end = anchors[i + 1] ?? null
  const out: Node[] = []
  let n: Node | null = start
  while (n && n !== end && n.parentNode === parent) {
    out.push(n)
    n = n.nextSibling
  }
  return out
}

export function patchChildren(
  parent: Node,
  oldInput: VNodeChild | null,
  newInput: VNodeChild | null,
  ctx: PatchCtx,
  oldRange?: Node[] | null,
  oldAnchors?: (Node | null)[] | null,
  anchorOut?: (Node | null)[],
): (Node | null)[] {
  // 过滤已删除（占位法替代）：数组上下文的无渲染值（false/null/true）由 renderValue 建占位节点——
  // DOM childNodes 与 children 数组同构（长度恒等），数组项原样参与 diff（用户 vnode 零 magic，
  // 规则表 §1/§3）。
  // 数组项 = 隐式 Fragment：保真用户结构（不展开——vnode 任何阶段以用户 JSX 为标准，规则表
  // §1-20）。old/new children 是外层数组（含数组项原样）；数组项在下方配对分支递归处理
  const oldChildren = arrayChildren(oldInput)
  const newChildren = arrayChildren(newInput)
  const source = oldAnchors ?? oldRange ?? Array.from(parent.childNodes)
  if (traceEnabled('diff')) trace('diff', 'debug', '', `patchChildren parent=${nodeDesc(parent)} old=${kidsSeq(oldChildren)} new=${kidsSeq(newChildren)} dom=${childNodesSeq(parent)}`)

  // 混合 keyed 数组（部分项有用户 key）：给无 key 项自动分配位置 key——
  // 否则 keyed 分支对无 key 项「移除旧 + 新建」→ 固定结构（表头/行标签等）每次 render 重建 → 闪烁。
  // （v1 ensureKeys 精神——但 v1 只在全无 key 时分配，混合场景缺失：DatePicker 面板
  //  [header(无key), ...gridRows(keyed)] 每次选时间整段重建的真实 bug）
  // 注意：portal（_placement: 'remote'）的 portalKey 不算用户 keyed（C1——
  // [input(无key), portal] 走 allUnkeyed 按位置复用，不分配 pos key、不 mutate vnode.key）
  const hasUserKey = newChildren.some((c) => {
    if (c == null || typeof c !== 'object' || Array.isArray(c)) return false
    const vn = c as VNode
    return !isPortal(vn) && vn.key !== null
  })
  // 数组项（隐式 Fragment）存在（新旧任一）→ 外层位置配对（数组项无 key 身份——默认位置语义；
  // 内层数组内部各自 keyed——层级独立。混合 keyed 的外层（列表 + 固定元素：items.map() + footer）
  // 中数组项按位置、显式 key 项按位置——不混合 keyed 匹配）。
  // 必须含 oldChildren：旧数组项在 keyed 分支无匹配（getKey 对数组返回 undefined 不建 keyMap）
  // → 旧数组项消失（长度差/移除）被 keyed 忽略 → 残留（[c,d,[e,f]]→[c,d] 的 [e,f] 残留）
  const hasArrayItem = newChildren.some((c) => Array.isArray(c)) || oldChildren.some((c) => Array.isArray(c))
  if (traceEnabled('diff')) trace('diff', 'debug', '', `mode=${hasUserKey && !hasArrayItem ? 'keyed' : 'unkeyed'} hasUserKey=${hasUserKey} hasArrayItem=${hasArrayItem}`)
  // 数组项递归场景（oldRange 传入——数组项 vs 数组项配对分支）：旧数组项范围 = [start, 内容..., end] 标记。
  // keyed/allUnkeyed 新增分支必须插到范围内（end 标记前），否则新内容插到容器首/尾
  // （真实 bug：ARR(0)→ARR(2) 文件按钮跑到 Card children 最前——frag-arr-content-change trace 定位 2026-12）
  const arrEnd = oldRange && oldRange.length ? oldRange[oldRange.length - 1] : null
  if (hasUserKey) {
    for (let i = 0; i < newChildren.length; i++) {
      const c = newChildren[i]
      if (c && typeof c === 'object' && !Array.isArray(c) && getKey(c) === null) (c as VNode).key = `pos:${i}`
    }
    for (let i = 0; i < oldChildren.length; i++) {
      const c = oldChildren[i]
      if (c && typeof c === 'object' && !Array.isArray(c) && getKey(c) === null) (c as VNode).key = `pos:${i}`
    }
  }

  // 映射旧 DOM 范围（锚点优先：_childAnchors 每位置首节点——替代 source[i] 下标猜测，
  // fragment/数组项多节点展开后不错位——规则表 §5；文本/null 用 source 位置）
  const oldNodes: (Node | null)[] = oldAnchors
    ? oldAnchors.map((a, i) => a ?? (i < oldChildren.length && oldChildren[i] != null && typeof oldChildren[i] === 'object' && !Array.isArray(oldChildren[i]) ? (oldChildren[i] as VNode)._refNode ?? null : null))
    : (() => {
        // 数组项递归传入的 oldRange 含边界标记（[start1, c, d, start2, e, f, end2, end1]）——
        // source[i] 索引与 oldChildren 内容项错位（标记占位 + 嵌套数组项内部节点）。
        // 剥离首尾标记得内容序列；数组项锚点 = 其 start 标记（srcIdx 推进不消费内部节点）
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
            // 数组项锚点 = 其 start 标记（内容序列中该位置）；内部节点（内容+嵌套标记）不消费 src
            nodes.push(src[k] ?? null)
            k++
            continue
          }
          if (c == null || typeof c === 'boolean') { nodes.push(src[k] ?? null); k++; continue }
          if (typeof c === 'string' || typeof c === 'number') { nodes.push(src[k] ?? null); k++; continue }
          const vn = c as VNode
          if (isPortal(vn)) { nodes.push((vn._remoteEl ?? null) as Node | null); continue }
          // Frag 锚点 = start 标记（标记化统一——source 内 Frag 项位置即标记；与数组项同款）
          if (isFrag(vn)) { nodes.push(src[k] ?? null); k++; continue }
          // 组件锚点 = _refNode；native 锚点 = el（类型守卫收窄——强类型约束）
          nodes.push(vn._refNode ?? (isNative(vn) ? vn.el : null) ?? src[k] ?? null)
          k++
        }
        return nodes
      })()

  // C1：remote（portal）的 portalKey 不算用户 keyed——[input(无key), portal] 走 allUnkeyed 按位置复用
  const allUnkeyed = hasArrayItem || !newChildren.some((c) => {
    if (c == null || typeof c !== 'object' || Array.isArray(c)) return false
    const vn = c as VNode
    return !isPortal(vn) && vn.key !== null
  })

  if (allUnkeyed) {
    // 无 key：按位置匹配（不移动 DOM）
    const len = Math.max(oldChildren.length, newChildren.length)
    const out: (Node | null)[] = []
    const pushA = (n: Node | null) => { if (anchorOut) anchorOut.push(n) }
    for (let i = 0; i < len; i++) {
      const oldC = i < oldChildren.length ? oldChildren[i] : null
      const newC = i < newChildren.length ? newChildren[i] : null
      if (traceEnabled('diff')) trace('diff', 'trace', '', `pos ${i} old=${vnDesc(oldC)} new=${vnDesc(newC)} oldNode=${nodeDesc(oldNodes[i])}`)
      if (newC == null || typeof newC === 'boolean') {
        const on = oldNodes[i]
        const b = ctx.browser ?? createClientBrowser()
        // 数组长度差（i 超出新数组——newC=null 来自 len=max）：多余旧项 → 移除（不是占位——
        // 新数组没有该位置；占位法"长度恒定"只适用于数组内 false/null（长度不变时互转））
        if (i >= newChildren.length) {
          if (Array.isArray(oldC)) {
            if (traceEnabled('diff')) trace('diff', 'trace', '', `remove-arr-item i=${i} range=[${rangeFor(oldNodes, i, parent).map(nodeDesc).join(' | ')}] before=${childNodesSeq(parent)}`)

            // 旧数组项（隐式 Fragment）整体移除：范围（含边界标记）+ 内层组件 dispose
            const range = rangeFor(oldNodes, i, parent)
            for (const n of range) n.parentNode?.removeChild(n)
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
          continue
        }
        const newHole = createHole(b, newC)
        if (oldC == null || typeof oldC === 'boolean') {
          // 占位 ↔ 占位：内容更新（nodeValue 直改——长度恒定，预捕获 source 索引全有效）
          if (on?.nodeType === 8) {
            if (newHole && on.nodeValue !== newHole.nodeValue) on.nodeValue = newHole.nodeValue
            out.push(on)
            pushA(on)
          } else {
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
          continue
        }
        // 真实 → 占位：dispose/ref 清理 + replaceChild（不 removeChild——childNodes 长度恒定）
        // 但 Fragment/数组项是多节点输出——只替换锚点则其余节点残留（frag-hole-switch 定位 2026-12）
        if (Array.isArray(oldC)) {
          // 数组项（隐式 Fragment）→ 占位：移除整范围（start..end 标记 + 内容）+ 组件 dispose
          const range = rangeFor(oldNodes, i, parent)
          const ref = (range[range.length - 1] ?? on)?.nextSibling ?? null
          for (const n of range) n.parentNode?.removeChild(n)
          for (const sub of oldC) {
            if (sub != null && typeof sub === 'object' && !Array.isArray(sub) && typeof (sub as VNode).type === 'function') {
              disposeComponent(sub as VNode, ctx.registry)
            }
          }
          if (newHole && ref && ref.parentNode === parent) parent.insertBefore(newHole, ref)
          else if (newHole) parent.appendChild(newHole)
          out.push(newHole)
          pushA(newHole)
          continue
        }
        if (oldC && typeof oldC === 'object' && !Array.isArray(oldC) && (oldC as VNode).type === Fragment) {
          const ref = removeOldOutput(oldC, on, parent, ctx)
          if (newHole && ref) parent.insertBefore(newHole, ref)
          else if (newHole) parent.appendChild(newHole)
          out.push(newHole)
          pushA(newHole)
          continue
        }
        if (oldC && typeof oldC === 'object' && !Array.isArray(oldC) && typeof (oldC as VNode).type === 'function') {
          // 组件：输出可能多节点（Fragment/数组）——removeOldOutput 经 _outputChild 整体移除（B5）
          const ref = removeOldOutput(oldC, on, parent, ctx)
          if (newHole && ref) parent.insertBefore(newHole, ref)
          else if (newHole) parent.appendChild(newHole)
          out.push(newHole)
          pushA(newHole)
          continue
        }
        if (oldC && typeof oldC === 'object' && !Array.isArray(oldC)) {
          if (typeof (oldC as VNode).type === 'function') {
            disposeComponent(oldC as VNode, ctx.registry)
          } else {
            try { callRefCleanupFor(oldC as VNode, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
          }
        }
        if (newHole && on?.parentNode) on.parentNode.replaceChild(newHole, on)
        else if (newHole) parent.appendChild(newHole)
        out.push(newHole)
        pushA(newHole)
        continue
      }
      // V3-3a：引用短路——newC === oldC（vnode 引用相等 = 子树未变——JS 对象不可变约定）
      // → 跳过 patchValue 全递归（未变项零开销）。命中场景：renderFn 返回稳定数组引用
      // （props.items 原样透传）+ build 同步构建的 native 项（引用保持）；组件项剪枝
      // 已由 patchValue 组件 skip 覆盖（此处短路仅原生项）
      if (oldC != null && typeof oldC === 'object' && !Array.isArray(oldC) &&
          newC != null && typeof newC === 'object' && !Array.isArray(newC) &&
          newC === oldC) {
        out.push(oldNodes[i])
        pushA(oldNodes[i])
        continue
      }
      if (oldC == null || typeof oldC === 'boolean') {
        // 新旧都是无渲染值（null/false/undefined 同构）——占位法长度恒定：旧 hole 位置不动，
        // 不重建不删除（否则 null 位置的 hole 在 rerender 后消失——结构错位：Chat 回复条缺失根因）
        if (newC == null || typeof newC === 'boolean') {
          const hole = oldNodes[i] ?? null
          out.push(hole)
          pushA(hole)
          continue
        }
        // 新增：渲染 + 插入（key = 位置身份——标记带下标，与首帧渲染一致）
        const node = renderValue(newC, ctx, ctx.browser ?? createClientBrowser(), String(i))
        if (node == null) { out.push(null); pushA(null); continue }
        const oldHole = oldNodes[i]
        // 占位 → 真实：replaceChild（占位法下旧位置是注释节点——长度恒定，索引全有效）
        if (oldHole && oldHole.nodeType === 8 && oldHole.nodeValue?.includes('type=hole')) {
          oldHole.parentNode?.replaceChild(node, oldHole)
          out.push(node)
          pushA(node)
          continue
        }
        // 无占位（旧 children 短于新/尾部新增）→ 原 next-sibling 逻辑（位置正确）
        let next: Node | null = null
        for (let j = i + 1; j < oldNodes.length; j++) {
          const n = oldNodes[j]
          if (n && n.parentNode === parent) { next = n; break }
        }
        // Fragment 内新增：oldNodes 用完（旧 children 短于新）→ 优先用已处理项（out 尾部）的
        // nextSibling（连续新增按序插入）；fallback 用最后一个旧节点的 nextSibling（Fragment
        // 尾节点后的兄弟——c）——否则 append 末尾/顺序颠倒（diff-fragment bug）
        if (!next) {
          let last: Node | null = null
          for (let k = out.length - 1; k >= 0; k--) if (out[k]) { last = out[k]; break }
          if (last && last.parentNode === parent) next = last.nextSibling
          if (!next) {
            const l = oldNodes[oldNodes.length - 1]
            if (l && l.parentNode === parent) next = l.nextSibling
          }
        }
        if (next && next.parentNode === parent) parent.insertBefore(node, next)
        else parent.appendChild(node)
        out.push(node)
        pushA(node)
        continue
      }
      // ── 数组项（隐式 Fragment）配对 ──
      // 数组项 = 隐式 Fragment：无 key 身份（默认位置语义）——外层位置配对，内层递归（层级独立）
      if (Array.isArray(newC)) {
        const b = ctx.browser ?? createClientBrowser()
        if (Array.isArray(oldC)) {
          // 数组项 vs 数组项：递归（内层配对）——范围 = 锚点推导（锚点[i] 到锚点[i+1] 之间）
          const range = rangeFor(oldNodes, i, parent)
          const inner = patchChildren(parent, oldC, newC, ctx, range)
          out.push(...inner)
          pushA(inner[0] ?? null)
          continue
        }
        // 新数组项 vs 旧非数组：替换——移除旧输出范围（引用驱动——旧项可能是 Fragment/组件
        // 多节点，只 replaceChild 锚点则残留——vdom2-matrix 矩阵 frag→arr 失败）+ 渲染数组项
        const node = renderValue(newC, ctx, b, String(i))
        if (node == null) { out.push(null); pushA(null); continue }
        const oldHole = oldNodes[i]
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
        continue
      }
      if (Array.isArray(oldC)) {
        // 旧数组项 vs 新非数组：移除旧数组项范围（dispose 组件） + 渲染新
        const b = ctx.browser ?? createClientBrowser()
        const range = rangeFor(oldNodes, i, parent)
        if (traceEnabled('diff')) trace('diff', 'debug', '', `arr-remove i=${i} range=[${range.map(nodeDesc).join(' | ')}]`)
        for (const n of range) {
          n.parentNode?.removeChild(n)
        }
        // 数组项内组件 dispose（范围节点已移除——组件状态清理）
        for (const sub of oldC) {
          if (sub != null && typeof sub === 'object' && !Array.isArray(sub) && typeof (sub as VNode).type === 'function') {
            disposeComponent(sub as VNode, ctx.registry)
          }
        }
        const node = renderValue(newC, ctx, b, String(i))
        if (node == null) { out.push(null); pushA(null); continue }
        // 插入到数组项范围后的位置（下一个锚点前）——数组项首节点已移除，用范围后首个节点作参考
        const anchor = oldNodes[i + 1] ?? null
        if (anchor?.parentNode) anchor.parentNode.insertBefore(node, anchor)
        else parent.appendChild(node)
        out.push(node)
        pushA(node)
        continue
      }
      const node = patchValue(parent, oldNodes[i], oldC, newC, ctx)
      if (traceEnabled('diff')) trace('diff', 'trace', '', `after-patch i=${i} new=${vnDesc(newC)} node=${nodeDesc(node)} dom=${childNodesSeq(parent)}`)
      // Fragment 项展开全部 childNodes（patchValue 只返回锚点——多节点 Fragment 漏收）
      const collected = collectChildNodes(newC, node)
      out.push(...collected)
      pushA(collected[0] ?? node ?? null)
    }
    return out
  }

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
      // 占位项（false/null/true，无 key——规则表 §3 豁免）：位置对齐处理（占位↔占位内容更新 / 真实→占位）
      if (c == null || typeof c === 'boolean') {
        const oldC = oldChildren[i] ?? null
        const on = oldNodes[i] ?? null
        const hole = createHole(ctx.browser ?? createClientBrowser(), c)
        if (oldC == null || typeof oldC === 'boolean') {
          // 占位 ↔ 占位：内容更新（nodeValue 直改，长度恒定）
          if (on?.nodeType === 8) {
            if (hole && on.nodeValue !== hole.nodeValue) on.nodeValue = hole.nodeValue
            out.push(on)
            pushA(on)
            if (on) lastDom = on
          } else {
            if (hole && on?.parentNode) on.parentNode.replaceChild(hole, on)
            else if (hole) parent.appendChild(hole)
            out.push(hole)
            pushA(hole)
            if (hole) lastDom = hole
          }
        } else {
          // 真实 → 占位：dispose/ref 清理 + replaceChild（不 removeChild——长度恒定）
          // 但 Fragment/数组项是多节点输出——只替换锚点则其余节点残留（frag-hole-switch 定位 2026-12）
          if (Array.isArray(oldC)) {
            // 数组项（隐式 Fragment）→ 占位：移除整范围（start..end 标记 + 内容）+ 组件 dispose
            const range = rangeFor(oldNodes, i, parent)
            const ref = (range[range.length - 1] ?? on)?.nextSibling ?? null
            for (const n of range) n.parentNode?.removeChild(n)
            for (const sub of oldC) {
              if (sub != null && typeof sub === 'object' && !Array.isArray(sub) && typeof (sub as VNode).type === 'function') {
                disposeComponent(sub as VNode, ctx.registry)
              }
            }
            if (hole && ref && ref.parentNode === parent) parent.insertBefore(hole, ref)
            else if (hole) parent.appendChild(hole)
            out.push(hole)
            pushA(hole)
            if (hole) lastDom = hole
            return
          }
          if (typeof oldC === 'object' && !Array.isArray(oldC) && (oldC as VNode).type === Fragment) {
            const ref = removeOldOutput(oldC, on, parent, ctx)
            if (hole && ref) parent.insertBefore(hole, ref)
            else if (hole) parent.appendChild(hole)
            out.push(hole)
            pushA(hole)
            if (hole) lastDom = hole
            return
          }
          if (typeof oldC === 'object' && !Array.isArray(oldC) && typeof (oldC as VNode).type === 'function') {
            // 组件：输出可能多节点（Fragment/数组）——removeOldOutput 经 _outputChild 整体移除（B5）
            const ref = removeOldOutput(oldC, on, parent, ctx)
            if (hole && ref) parent.insertBefore(hole, ref)
            else if (hole) parent.appendChild(hole)
            out.push(hole)
            pushA(hole)
            if (hole) lastDom = hole
            return
          }
          if (typeof oldC === 'object' && !Array.isArray(oldC)) {
            if (typeof (oldC as VNode).type === 'function') disposeComponent(oldC as VNode, ctx.registry)
            else { try { callRefCleanupFor(oldC as VNode, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
          }
          if (hole && on?.parentNode) on.parentNode.replaceChild(hole, on)
          else if (hole) parent.appendChild(hole)
          out.push(hole)
          pushA(hole)
          if (hole) lastDom = hole
        }
        return
      }
      // 新增——但 remote（portal）项必须走 patchValue：H 的 Portal 分支复用旧容器 patch 内容
      // （v1 patchPortal 语义——否则混合 keyed 数组里 portal 每次 render renderValue 新建容器
      //  → Popover 内容（Editor table grid）整体重建 → 闪烁）
      if (isPortal(newV)) {
        const oldC = oldChildren[i] ?? null
        const node = patchValue(parent, oldNodes[i] ?? null, oldC, newV, ctx)
        const collected = collectChildNodes(newV, node)
        out.push(...collected)
        pushA(collected[0] ?? node ?? null)
        const last = collected[collected.length - 1] ?? node
        if (last) lastDom = last
      } else {
        const node = renderValue(newV, ctx, ctx.browser ?? createClientBrowser())
        out.push(node)
        pushA(node ?? null)
        if (node != null) {
          const oldHole = oldNodes[i]
          // 占位 → 真实：replaceChild（§5 占位↔真实——Alert 顶替 false 位置，长度恒定）
          if (oldHole && oldHole.nodeType === 8 && oldHole.nodeValue?.includes('type=hole')) {
            oldHole.parentNode?.replaceChild(node, oldHole)
            lastDom = node
          } else {
            // P-4：新增节点单次插入——直接插到正确位置（不 append 末尾再校正）
            // lastDom 存在 → 插到已处理链尾后（中间/尾部插入：1 次写）
            // lastDom 为 null（列表头新增）→ 优先数组项递归锚点（end 标记前——ARR(0)→ARR(2)
            //   新增内容必须留在旧数组项范围内，否则插到容器最前）；无锚点 → 插到第一个旧节点前
            //   （头部插入：1 次写——旧实现 append 末尾导致后续所有匹配项位置校正 insertBefore 移动——
            //   100 行头部插入 = 103 次 DOM 写，perf 基准实锤）
            if (lastDom) parent.insertBefore(node, lastDom.nextSibling)
            else if (arrEnd && arrEnd.parentNode === parent) parent.insertBefore(node, arrEnd)
            else parent.insertBefore(node, parent.firstChild)
            lastDom = node
          }
        }
      }
    }
  })
  // 删除未移动的旧节点
  // 引用驱动（vdom2）：多节点旧项（Fragment/组件输出/数组项）按输出范围移除——
  // 只 removeChild 锚点则其余节点残留（keyed 分支 frag→text/comp 矩阵失败）
  oldChildren.forEach((c, i) => {
    const k = getKey(c)
    const isComponent = c && typeof c === 'object' && !Array.isArray(c) && typeof (c as VNode).type === 'function'
    if (k !== null && !movedKeys.has(k)) {
      const range = c && typeof c === 'object' && !Array.isArray(c) ? getOutputRange(c, oldNodes[i]) : null
      if (traceEnabled('diff')) trace('diff', 'trace', '', `keyed-delete i=${i} k=${k} range=${range?.length ?? 0} oldNode=${nodeDesc(oldNodes[i])}`)
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        if (isComponent) disposeComponent(c as VNode, ctx.registry)
        else { try { callRefCleanupFor(c as VNode, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
      }
      const on = oldNodes[i]
      if (range && range.length > 1) {
        for (const n of range) if (n.parentNode) n.parentNode.removeChild(n)
      } else if (on?.parentNode) on.parentNode.removeChild(on)
    } else if (k === null) {
      const on = oldNodes[i]
      const isHole = on?.nodeType === 8 && on.nodeValue?.includes('type=hole')
      // 占位保留（占位法：长度恒定——占位↔占位/占位→真实已由新建分支处理）；
      // 仅当 new 侧无对应位置（数组缩短 i >= newChildren.length）或非占位项（文本/真实）才删除。
      // 注意：不能用 newC == null 判断缩短——数组内 null 本身是占位项（有位置），
      // newC=null 是「占位↔占位」需保留；数组缩短是 i 超界（Chat 回复条缺失根因）
      if (!isHole || i >= newChildren.length) {
        if (c && typeof c === 'object' && !Array.isArray(c)) {
          if (isComponent) disposeComponent(c as VNode, ctx.registry)
          else { try { callRefCleanupFor(c as VNode, ctx.registry) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
        }
        const range = c && typeof c === 'object' && !Array.isArray(c) ? getOutputRange(c, on) : null
        if (range && range.length > 1) {
          for (const n of range) if (n.parentNode) n.parentNode.removeChild(n)
        } else if (on?.parentNode) on.parentNode.removeChild(on)
      }
    }
  })
  return out
}
