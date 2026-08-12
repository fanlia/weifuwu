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
import { Fragment, Portal, arrayChildren } from '../vnode.ts'
// re-export（v1 导入点兼容——arrayChildren 已移至 vnode.ts 统一）
export { arrayChildren }
import { createClientBrowser } from '../browser.ts'
import { cleanupComponent, type Registry } from './registry.ts'
import { callRefCleanupFor } from './registry.ts'

/** 组件 vnode 从树中移除：ref(null) 递归 + 卸载钩子（cleanupComponent） */
function disposeComponent(vnode: VNode, registry?: Registry): void {
  if (registry && typeof vnode.type === 'function' && vnode._id) {
    try { callRefCleanupFor(vnode, registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
    cleanupComponent(registry, vnode._id)
  }
}
import { renderValue, setProp, EVENT_RE, createHole, eventTarget } from './render.ts'


/** 从 vnode 取稳定 key（Portal 内部 key 不算用户 keyed） */
function getKey(v: VNodeChild): string | undefined {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return undefined
  const vn = v as VNode
  // remote（portal）：portalKey 作 key（v1 语义——keyed diff 复用容器 patch 内容）。
  // C1（input+portal 焦点）由 allUnkeyed 判断排除 remote 保证——这里返回 key 不影响 allUnkeyed
  if (vn._placement === 'remote') return vn.props?.portalKey as string | undefined
  return vn.key
}

/** 子项输出收集：Fragment 项展开全部 childNodes——patchValue 只返回锚点（首个节点），
 *  数组分支/frag 收全需要完整范围（否则 Fragment 后续节点残留——diff-fragment 真实 bug） */
function collectChildNodes(newC: VNodeChild, node: Node | null): (Node | null)[] {
  if (node && newC && typeof newC === 'object' && !Array.isArray(newC) && (newC as VNode).type === Fragment) {
    const nodes = (newC as VNode)._childNodes
    if (nodes && nodes.length) return nodes
  }
  return [node]
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
  // 文本/数字
  if (typeof newInput === 'string' || typeof newInput === 'number') {
    if (typeof oldInput === 'string' || typeof oldInput === 'number') {
      if (String(oldInput) !== String(newInput)) {
        // V3-1：文本节点复用——nodeValue 直改（1 次属性写）替代 createTextNode +
        // replaceChild（2 次 DOM 节点操作——实测 7.9x 差距）。旧文本节点引用不变
        // （_refNode 不漂移——diff 锚点更稳定）；首帧/新增路径仍 createTextNode
        if (oldNode && oldNode.nodeType === 3) {
          oldNode.nodeValue = String(newInput)
          return oldNode
        }
        const t = parent.ownerDocument!.createTextNode(String(newInput))
        if (oldNode?.parentNode) oldNode.parentNode.replaceChild(t, oldNode)
        else parent.appendChild(t)
        return t
      }
      return oldNode
    }
    const t = parent.ownerDocument!.createTextNode(String(newInput))
    if (oldNode?.parentNode) oldNode.parentNode.replaceChild(t, oldNode)
    else parent.appendChild(t)
    return t
  }
  if (newInput == null || typeof newInput === 'boolean') {
    // 旧输出是 Portal（remote）→ 移除 remote 容器（vdom renderValue 在 #__wf_portal）
    if (oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) && (oldInput as VNode).type === Portal) {
      const remoteEl = (oldInput as VNode)._remoteEl
      // 递归清理 portal 内容的 ref（Modal root div 的 rootRef → unlockScroll；
      // 直接 removeChild 会跳过 ref(null) → 滚动锁泄漏 → body overflow 卡 hidden）
      try { callRefCleanupFor((oldInput as VNode).props?.children, ctx.registry as any) } catch (e) { console.error('[weifuwu] portal ref cleanup error', e) }
      remoteEl?.parentNode?.removeChild(remoteEl)
      return null
    }
    if (oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput)) {
      // 组件：完整 dispose（ref 清理 + 卸载钩子）；原生元素：ref(null) 清理
      // （Modal root div 移除时若不调 ref(null)——usePopup 的 portalPanelRef 依赖它 unlockScroll——
      //   滚动锁泄漏 → body overflow 卡 hidden → 滑动条消失）
      if (typeof (oldInput as VNode).type === 'function') {
        disposeComponent(oldInput as VNode, ctx.registry)
      } else {
        try { callRefCleanupFor(oldInput as VNode, ctx.registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
      }
    }
    if (oldNode?.parentNode) oldNode.parentNode.removeChild(oldNode)
    return null
  }
  if (Array.isArray(newInput)) {
    // V3-3a：数组引用相同 → 内容未变（构建产物不可变约定——renderFn 返回稳定数组
    // 引用透传；引用相同 = 未变，patchChildren 短路返回旧节点后 frag 重建会把旧节点
    // append 移动（无意义 DOM 写——200 项短路 → 200 次 append）——顶层直接短路零操作）
    if (oldInput === newInput && oldNode?.parentNode) return oldNode
    // 数组 patch（patchChildren 处理——顶层数组转 fragment 语义）
    const frag = parent.ownerDocument!.createDocumentFragment()
    const range = patchChildren(parent, oldInput, newInput, ctx, oldNode ? [oldNode] : undefined)
    for (const n of range) if (n) frag.appendChild(n)
    if (oldNode?.parentNode) {
      // frag 可能已含 oldNode（patchChildren 对照复用了旧 DOM）——replaceChild(frag, oldNode)
      // 会抛 HierarchyRequestError（new child contains parent）——此时只需 append（节点被移动）
      if (!frag.contains(oldNode)) oldNode.parentNode.replaceChild(frag, oldNode)
      else parent.appendChild(frag)
    } else {
      parent.appendChild(frag)
    }
    return frag
  }

  const newV = newInput as VNode

  // Portal：remote patch（递归 patch——不重建容器内容。
  // 重建（innerHTML=''）会丢 portal 内 ref 状态——Modal 退场 animationend 监听等）
  if (newV.type === Portal) {
    const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null
    if (oldV?.type === Portal) {
      const container = oldV._remoteEl
      if (container) {
        const oldChild = oldV.props?.children ?? null
        const newChild = newV.props?.children ?? null
        // patchChildren 直接处理（v1 patchPortal 精神——复用容器 patch 子节点，不操作父 DOM）。
        // patchValue 数组分支会「frag.contains(oldNode) → appendChild」重排容器 →
        // portal 内容每次 render 被移除重加 → datetime 选中日期闪烁的真实根因
        patchChildren(container, oldChild, newChild, ctx)
      }
      newV._remoteEl = oldV._remoteEl
      return null
    }
    renderValue(newV, ctx, ctx.browser ?? createClientBrowser())
    return null
  }

  // Fragment
  if (newV.type === Fragment) {
    const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null
    const oldRange = oldV?._childNodes
    // oldInput 传旧 Fragment 的 props.children（旧 vnode 本身会导致 oldChildren 错位 1 项
    // ——[fragV] vs [b1,b2] → 替换路径新建节点 → 重复残留；diff-fragment 真实 bug）
    const range = patchChildren(parent, oldV?.props?.children ?? oldInput, newV.props?.children ?? null, ctx, oldRange)
    newV._childNodes = range.filter(Boolean) as Node[]
    if (oldNode?.parentNode && oldNode.nodeType === 8) oldNode.parentNode.removeChild(oldNode)
    return oldNode && oldNode.nodeType === 1 ? oldNode : (range[0] ?? null)
  }

  // 组件
  if (typeof newV.type === 'function') {
    if (typeof newV._render !== 'function') {
      throw new Error(
        `[vdom] component ${(newV.type as any).name || 'anonymous'} not built in diff — buildVNode must run before patchValue`,
      )
    }
    const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null

    // 三态 skip（V3-3c 前置——P-2 简化：diff 完全信任 buildVNode 产出——剪枝命中时 buildVNode
    // 直接复用旧 _child（引用相等 = 剪枝已通过 props/版本判断），diff 无需再比 props/版本；
    // force/版本变化路径 buildVNode 已重跑 renderFn（_child 是新树，引用不等 → 不 skip）
    // 必须同类型——导航 A→B 不同组件不得 skip，否则复用 A 的 _child → 页面不切换）
    // 前置到 id 传递/registry 注册之前——skip 时省 registry 写（V3-3c）
    const typeSame = oldV?.type === newV.type
    if (!ctx.force && oldV && typeSame && oldV._child !== undefined && newV._child === oldV._child) {
      return oldNode
    }

    // id 传递 + 注册
    if (oldV?.type === newV.type && oldV._id) {
      newV._id = oldV._id
      ctx.registry.idRegistry.set(newV._id, newV)
    }
    newV._parentNode = parent
    if (oldNode) newV._refNode = oldNode

    // 渲染输出（_child 必已由 buildVNode 预构建——renderFn 强制异步，diff 同步上下文
    // 永不执行 renderFn：异步 renderFn 在此执行会拿到 Promise → 泄漏进同步 diff）
    let childNew: VNodeChild
    if (newV._child === undefined) {
      throw new Error(
        `[vdom] component ${(newV.type as any).name || 'anonymous'} not built (missing _child) — buildVNode must run before patchValue`,
      )
    }
    childNew = newV._child
    const returned = patchValue(parent, oldNode, oldV?._child, childNew, ctx)
    if (returned) newV._refNode = returned
    return returned
  }

  // Native
  const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null
  const oldTag = oldV?.type ?? null
  const newTag = newV.type as string
  if (oldNode && oldNode.nodeType === 1 && oldTag === newTag) {
    // 同元素 patch
    const el = oldNode as Element
    newV.el = el
    patchProps(el, oldV?.props ?? {}, newV.props ?? {})
    // 规则表 §2 innerHTML：存在则 children 不渲染——diff 与 renderValue 同一判断（行为统一）
    if (!('innerHTML' in (newV.props ?? {}))) {
      const anchors: (Node | null)[] = []
      // 阶段 B：锚点优先（_childAnchors 每位置首节点——fragment/数组项展开后不错位，规则表 §5）
      patchChildren(el, oldV?.props?.children ?? null, newV.props?.children ?? null, ctx, undefined, (oldV as any)?._childAnchors, anchors)
      newV._childAnchors = anchors
    }
    return el
  }
  // 新增/替换
  const node = renderValue(newV, ctx, ctx.browser ?? createClientBrowser())
  if (node == null) return null
  if (oldNode?.parentNode) {
    if (oldInput != null && typeof oldInput !== 'boolean') {
      // 替换（oldInput 存在——object/string/数组）：清理旧 ref（object 时）+ replaceChild。
      // 注意 oldInput 为 string（文本→元素）也必须 replaceChild——不能 insertBefore（旧文本残留）
      if (typeof oldInput === 'object' && !Array.isArray(oldInput)) {
        try { callRefCleanupFor(oldInput as VNode, ctx.registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
      }
      oldNode.parentNode.replaceChild(node, oldNode)
    } else {
      // 新增（oldInput null/boolean + 锚点存在）：插入到锚点前——位置正确（v1 insertBefore 行为）
      oldNode.parentNode.insertBefore(node, oldNode)
    }
  } else {
    parent.appendChild(node)
  }
  return node
}

/** 属性 patch（只设不删语义保持简单；差异删除由 diff 上层处理） */
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
      if (typeof ov === 'function') el.removeEventListener(type, ov, capture ? { capture: true } : undefined)
      // 类型守卫：非函数值不抛错（once/only 等 on 开头非事件属性由 EVENT_RE 排除）
      if (nv != null && nv !== false) {
        if (typeof nv !== 'function') {
          console.warn(`[weifuwu] event prop ${key} expects a function, got ${typeof nv} — ignored`)
        } else {
          el.addEventListener(type, nv, capture ? { capture: true } : undefined)
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
      else { el.removeAttribute(key); try { delete (el as any)[key] } catch {} }
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
  oldInput: VNodeChild | null | undefined,
  newInput: VNodeChild | null | undefined,
  ctx: PatchCtx,
  oldRange?: Node[],
  oldAnchors?: (Node | null)[],
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

  // 混合 keyed 数组（部分项有用户 key）：给无 key 项自动分配位置 key——
  // 否则 keyed 分支对无 key 项「移除旧 + 新建」→ 固定结构（表头/行标签等）每次 render 重建 → 闪烁。
  // （v1 ensureKeys 精神——但 v1 只在全无 key 时分配，混合场景缺失：DatePicker 面板
  //  [header(无key), ...gridRows(keyed)] 每次选时间整段重建的真实 bug）
  // 注意：portal（_placement: 'remote'）的 portalKey 不算用户 keyed（C1——
  // [input(无key), portal] 走 allUnkeyed 按位置复用，不分配 pos key、不 mutate vnode.key）
  const hasUserKey = newChildren.some((c) => {
    if (c == null || typeof c !== 'object' || Array.isArray(c)) return false
    const vn = c as VNode
    return vn._placement !== 'remote' && vn.key !== undefined
  })
  // 数组项（隐式 Fragment）存在（新旧任一）→ 外层位置配对（数组项无 key 身份——默认位置语义；
  // 内层数组内部各自 keyed——层级独立。混合 keyed 的外层（列表 + 固定元素：items.map() + footer）
  // 中数组项按位置、显式 key 项按位置——不混合 keyed 匹配）。
  // 必须含 oldChildren：旧数组项在 keyed 分支无匹配（getKey 对数组返回 undefined 不建 keyMap）
  // → 旧数组项消失（长度差/移除）被 keyed 忽略 → 残留（[c,d,[e,f]]→[c,d] 的 [e,f] 残留）
  const hasArrayItem = newChildren.some((c) => Array.isArray(c)) || oldChildren.some((c) => Array.isArray(c))
  if (hasUserKey) {
    for (let i = 0; i < newChildren.length; i++) {
      const c = newChildren[i]
      if (c && typeof c === 'object' && !Array.isArray(c) && getKey(c) === undefined) (c as VNode).key = `pos:${i}`
    }
    for (let i = 0; i < oldChildren.length; i++) {
      const c = oldChildren[i]
      if (c && typeof c === 'object' && !Array.isArray(c) && getKey(c) === undefined) (c as VNode).key = `pos:${i}`
    }
  }

  // 映射旧 DOM 范围（锚点优先：_childAnchors 每位置首节点——替代 source[i] 下标猜测，
  // fragment/数组项多节点展开后不错位——规则表 §5；文本/null 用 source 位置）
  const oldNodes: (Node | null)[] = oldAnchors
    ? oldAnchors.map((a, i) => a ?? (i < oldChildren.length ? (oldChildren[i] as any)?._refNode ?? null : null))
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
          if (vn._placement === 'remote') { nodes.push((vn._remoteEl ?? null) as Node | null); continue }
          if (vn.type === Fragment) { nodes.push(vn._childNodes?.[0] ?? null); k++; continue }
          nodes.push(vn._refNode ?? vn.el ?? src[k] ?? null)
          k++
        }
        return nodes
      })()

  // C1：remote（portal）的 portalKey 不算用户 keyed——[input(无key), portal] 走 allUnkeyed 按位置复用
  const allUnkeyed = hasArrayItem || !newChildren.some((c) => {
    if (c == null || typeof c !== 'object' || Array.isArray(c)) return false
    const vn = c as VNode
    return vn._placement !== 'remote' && vn.key !== undefined
  })

  if (allUnkeyed) {
    // 无 key：按位置匹配（不移动 DOM）
    const len = Math.max(oldChildren.length, newChildren.length)
    const out: (Node | null)[] = []
    const pushA = (n: Node | null) => { if (anchorOut) anchorOut.push(n) }
    for (let i = 0; i < len; i++) {
      const oldC = i < oldChildren.length ? oldChildren[i] : null
      const newC = i < newChildren.length ? newChildren[i] : null
      if (newC == null || typeof newC === 'boolean') {
        const on = oldNodes[i]
        const b = ctx.browser ?? createClientBrowser()
        // 数组长度差（i 超出新数组——newC=null 来自 len=max）：多余旧项 → 移除（不是占位——
        // 新数组没有该位置；占位法"长度恒定"只适用于数组内 false/null（长度不变时互转））
        if (i >= newChildren.length) {
          if (Array.isArray(oldC)) {
            // 旧数组项（隐式 Fragment）整体移除：范围（含边界标记）+ 内层组件 dispose
            const range = rangeFor(oldNodes, i, parent)
            for (const n of range) n.parentNode?.removeChild(n)
            for (const sub of oldC) {
              if (sub != null && typeof sub === 'object' && !Array.isArray(sub) && typeof (sub as VNode).type === 'function') {
                disposeComponent(sub as VNode, ctx.registry)
              }
            }
          } else if (oldC && typeof oldC === 'object' && !Array.isArray(oldC)) {
            if (typeof (oldC as VNode).type === 'function') disposeComponent(oldC as VNode, ctx.registry)
            else { try { callRefCleanupFor(oldC as VNode, ctx.registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
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
            else if (newHole) parent.appendChild(newHole)
            out.push(newHole)
            pushA(newHole)
          }
          continue
        }
        // 真实 → 占位：dispose/ref 清理 + replaceChild（不 removeChild——childNodes 长度恒定）
        if (oldC && typeof oldC === 'object' && !Array.isArray(oldC)) {
          if (typeof (oldC as VNode).type === 'function') {
            disposeComponent(oldC as VNode, ctx.registry)
          } else {
            try { callRefCleanupFor(oldC as VNode, ctx.registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
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
        // 新增：渲染 + 插入
        const node = renderValue(newC, ctx, ctx.browser ?? createClientBrowser())
        if (node == null) { out.push(null); pushA(null); continue }
        const oldHole = oldNodes[i]
        // 占位 → 真实：replaceChild（占位法下旧位置是注释节点——长度恒定，索引全有效）
        if (oldHole && oldHole.nodeType === 8 && oldHole.nodeValue?.startsWith('wf-hole:')) {
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
        // 新数组项 vs 旧非数组：替换——移除旧节点 + 渲染数组项（renderValue 数组分支 → fragment 内联）
        const node = renderValue(newC, ctx, b)
        if (node == null) { out.push(null); pushA(null); continue }
        const oldHole = oldNodes[i]
        if (oldHole?.parentNode) oldHole.parentNode.replaceChild(node, oldHole)
        else parent.appendChild(node)
        const inner = node.nodeType === 11 ? Array.from(node.childNodes) : [node]
        out.push(...inner)
        pushA(inner[0] ?? node)
        continue
      }
      if (Array.isArray(oldC)) {
        // 旧数组项 vs 新非数组：移除旧数组项范围（dispose 组件） + 渲染新
        const b = ctx.browser ?? createClientBrowser()
        const range = rangeFor(oldNodes, i, parent)
        for (const n of range) {
          n.parentNode?.removeChild(n)
        }
        // 数组项内组件 dispose（范围节点已移除——组件状态清理）
        for (const sub of oldC) {
          if (sub != null && typeof sub === 'object' && !Array.isArray(sub) && typeof (sub as VNode).type === 'function') {
            disposeComponent(sub as VNode, ctx.registry)
          }
        }
        const node = renderValue(newC, ctx, b)
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
    if (k !== undefined && c && typeof c === 'object' && !Array.isArray(c)) {
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
    if (k !== undefined && oldKeyMap.has(k)) {
      const entry = oldKeyMap.get(k)!
      const oldNode = entry.nodes[0] ?? null
      movedKeys.add(k)
      const node = patchValue(parent, oldNode, entry.vnode, newV, ctx)
      const collected = collectChildNodes(newV, node)
      // 位置校正：node 必须位于 lastDom 之后（keyed 重排——旧实现只 patch 不移动 DOM）
      // Fragment 项用最后一个节点校正（多节点展开——插入不能拆散 Fragment）
      const last = collected[collected.length - 1] ?? node
      if (last && last.parentNode === parent && lastDom && last.previousSibling !== lastDom) {
        parent.insertBefore(last, lastDom.nextSibling)
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
          if (typeof oldC === 'object' && !Array.isArray(oldC)) {
            if (typeof (oldC as VNode).type === 'function') disposeComponent(oldC as VNode, ctx.registry)
            else { try { callRefCleanupFor(oldC as VNode, ctx.registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
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
      if ((newV as any)?._placement === 'remote') {
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
          if (oldHole && oldHole.nodeType === 8 && oldHole.nodeValue?.startsWith('wf-hole:')) {
            oldHole.parentNode?.replaceChild(node, oldHole)
            lastDom = node
          } else {
            // P-4：新增节点单次插入——直接插到正确位置（不 append 末尾再校正）
            // lastDom 存在 → 插到已处理链尾后（中间/尾部插入：1 次写）
            // lastDom 为 null（列表头新增）→ 插到第一个旧节点前（头部插入：1 次写——
            //   旧实现 append 末尾导致后续所有匹配项位置校正 insertBefore 移动——
            //   100 行头部插入 = 103 次 DOM 写，perf 基准实锤）
            if (lastDom) parent.insertBefore(node, lastDom.nextSibling)
            else parent.insertBefore(node, parent.firstChild)
            lastDom = node
          }
        }
      }
    }
  })
  // 删除未移动的旧节点
  oldChildren.forEach((c, i) => {
    const k = getKey(c)
    const isComponent = c && typeof c === 'object' && !Array.isArray(c) && typeof (c as VNode).type === 'function'
    if (k !== undefined && !movedKeys.has(k)) {
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        if (isComponent) disposeComponent(c as VNode, ctx.registry)
        else { try { callRefCleanupFor(c as VNode, ctx.registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
      }
      const on = oldNodes[i]
      if (on?.parentNode) on.parentNode.removeChild(on)
    } else if (k === undefined) {
      const on = oldNodes[i]
      const isHole = on?.nodeType === 8 && on.nodeValue?.startsWith('wf-hole:')
      // 占位保留（占位法：长度恒定——占位↔占位/占位→真实已由新建分支处理）；
      // 仅当 new 侧无对应位置（数组缩短 i >= newChildren.length）或非占位项（文本/真实）才删除。
      // 注意：不能用 newC == null 判断缩短——数组内 null 本身是占位项（有位置），
      // newC=null 是「占位↔占位」需保留；数组缩短是 i 超界（Chat 回复条缺失根因）
      if (!isHole || i >= newChildren.length) {
        if (c && typeof c === 'object' && !Array.isArray(c)) {
          if (isComponent) disposeComponent(c as VNode, ctx.registry)
          else { try { callRefCleanupFor(c as VNode, ctx.registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
        }
        if (on?.parentNode) on.parentNode.removeChild(on)
      }
    }
  })
  return out
}
