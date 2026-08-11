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
import { Fragment, Portal, normalizeChildren } from '../vnode.ts'
// re-export（v1 导入点兼容——normalizeChildren 已移至 vnode.ts 统一）
export { normalizeChildren }
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
import { renderValue, setProp, EVENT_RE } from './render.ts'


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
    patchChildren(el, oldV?.props?.children ?? null, newV.props?.children ?? null, ctx)
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
      if (typeof ov === 'function') el.removeEventListener(key.slice(2).toLowerCase(), ov)
      // 类型守卫：非函数值不抛错（once/only 等 on 开头非事件属性由 EVENT_RE 排除）
      if (nv != null && nv !== false) {
        if (typeof nv !== 'function') {
          console.warn(`[weifuwu] event prop ${key} expects a function, got ${typeof nv} — ignored`)
        } else {
          el.addEventListener(key.slice(2).toLowerCase(), nv)
        }
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
export function patchChildren(
  parent: Node,
  oldInput: VNodeChild | null | undefined,
  newInput: VNodeChild | null | undefined,
  ctx: PatchCtx,
  oldRange?: Node[],
): (Node | null)[] {
  const oldChildren = normalizeChildren(oldInput)
  const newChildren = normalizeChildren(newInput)
  const source = oldRange ?? Array.from(parent.childNodes)

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

  // 映射旧 DOM 范围（文本/null 用 source 位置；组件用 _refNode 精确）
  const oldNodes: (Node | null)[] = oldChildren.map((c, i) => {
    if (c == null || typeof c !== 'object' || Array.isArray(c)) return source[i] ?? null
    const vn = c as VNode
    if (vn._placement === 'remote') return (vn._remoteEl ?? null) as Node | null
    if (vn.type === Fragment) return vn._childNodes?.[0] ?? null
    return vn._refNode ?? vn.el ?? null
  })

  // C1：remote（portal）的 portalKey 不算用户 keyed——[input(无key), portal] 走 allUnkeyed 按位置复用
  const allUnkeyed = !newChildren.some((c) => {
    if (c == null || typeof c !== 'object' || Array.isArray(c)) return false
    const vn = c as VNode
    return vn._placement !== 'remote' && vn.key !== undefined
  })

  if (allUnkeyed) {
    // 无 key：按位置匹配（不移动 DOM）
    const len = Math.max(oldChildren.length, newChildren.length)
    const out: (Node | null)[] = []
    for (let i = 0; i < len; i++) {
      const oldC = i < oldChildren.length ? oldChildren[i] : null
      const newC = i < newChildren.length ? newChildren[i] : null
      if (newC == null || typeof newC === 'boolean') {
        if (oldC && typeof oldC === 'object' && !Array.isArray(oldC)) {
          if (typeof (oldC as VNode).type === 'function') {
            disposeComponent(oldC as VNode, ctx.registry)
          } else {
            try { callRefCleanupFor(oldC as VNode, ctx.registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) }
          }
        }
        const on = oldNodes[i]
        if (on?.parentNode) on.parentNode.removeChild(on)
        out.push(null)
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
        continue
      }
      if (oldC == null || typeof oldC === 'boolean') {
        // 新增：渲染 + 插到下一个兄弟前（位置正确）
        const node = renderValue(newC, ctx, ctx.browser ?? createClientBrowser())
        if (node == null) { out.push(null); continue }
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
        continue
      }
      const node = patchValue(parent, oldNodes[i], oldC, newC, ctx)
      // Fragment 项展开全部 childNodes（patchValue 只返回锚点——多节点 Fragment 漏收）
      out.push(...collectChildNodes(newC, node))
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
      if (last) lastDom = last
    } else {
      // 新增——但 remote（portal）项必须走 patchValue：H 的 Portal 分支复用旧容器 patch 内容
      // （v1 patchPortal 语义——否则混合 keyed 数组里 portal 每次 render renderValue 新建容器
      //  → Popover 内容（Editor table grid）整体重建 → 闪烁）
      if ((newV as any)?._placement === 'remote') {
        const oldC = oldChildren[i] ?? null
        const node = patchValue(parent, oldNodes[i] ?? null, oldC, newV, ctx)
        const collected = collectChildNodes(newV, node)
        out.push(...collected)
        const last = collected[collected.length - 1] ?? node
        if (last) lastDom = last
      } else {
        const node = renderValue(newV, ctx, ctx.browser ?? createClientBrowser())
        out.push(node)
        if (node != null) {
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
      if (c && typeof c === 'object' && !Array.isArray(c)) {
        if (isComponent) disposeComponent(c as VNode, ctx.registry)
        else { try { callRefCleanupFor(c as VNode, ctx.registry as any) } catch (e) { console.error('[weifuwu] ref cleanup error', e) } }
      }
      const on = oldNodes[i]
      if (on?.parentNode) on.parentNode.removeChild(on)
    }
  })
  return out
}
