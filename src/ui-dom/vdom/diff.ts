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
import { Fragment, Portal } from '../vnode.ts'
import { renderValue, setProp } from './render.ts'
import { componentPropsEqual } from './build.ts'

/** 递归文本/数组归一化（children 数组展开——嵌套数组扁平化，DOM 范围对齐） */
export function normalizeChildren(c: VNodeChild | undefined | null): VNodeChild[] {
  if (c == null || typeof c === 'boolean') return []
  const out: VNodeChild[] = []
  const stack: VNodeChild[] = Array.isArray(c) ? [...c] : [c]
  while (stack.length > 0) {
    const item = stack.shift()!
    if (Array.isArray(item)) stack.unshift(...item)
    else out.push(item)
  }
  return out
}

/** 从 vnode 取稳定 key（Portal 内部 key 不算用户 keyed） */
function getKey(v: VNodeChild): string | undefined {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return undefined
  const vn = v as VNode
  if (vn._placement === 'remote') return undefined
  return vn.key
}

export interface PatchCtx {
  browser: any
  registry: import('./registry.ts').Registry
  /** 三态 skip 的 dirty 集合（组件 id → true） */
  dirtySet?: Set<string>
  /** 已渲染组件（skip 判定——记录到 ctx，供 scheduler 清 dirty） */
  rendered?: Set<string>
  /** 当前 ctx 版本号 */
  ctxVersion?: number
  getCtxVersion?: (id: string) => number
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
      remoteEl?.parentNode?.removeChild(remoteEl)
      return null
    }
    if (oldNode?.parentNode) oldNode.parentNode.removeChild(oldNode)
    return null
  }
  if (Array.isArray(newInput)) {
    // 数组 patch（patchChildren 处理——顶层数组转 fragment 语义）
    const frag = parent.ownerDocument!.createDocumentFragment()
    const range = patchChildren(parent, oldInput, newInput, ctx, oldNode ? [oldNode] : undefined)
    for (const n of range) if (n) frag.appendChild(n)
    if (oldNode?.parentNode) oldNode.parentNode.replaceChild(frag, oldNode)
    else parent.appendChild(frag)
    return frag
  }

  const newV = newInput as VNode

  // Portal：remote patch（简化——重建容器内容）
  if (newV.type === Portal) {
    const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null
    if (oldV?.type === Portal) {
      const container = oldV._remoteEl
      if (container) {
        container.innerHTML = ''
        const child = renderValue(newV.props?.children ?? null, ctx, ctx.browser)
        if (child != null) container.appendChild(child)
      }
      newV._remoteEl = oldV._remoteEl
      return null
    }
    renderValue(newV, ctx, ctx.browser)
    return null
  }

  // Fragment
  if (newV.type === Fragment) {
    const oldV = oldInput && typeof oldInput === 'object' && !Array.isArray(oldInput) ? (oldInput as VNode) : null
    const oldRange = oldV?._childNodes
    const range = patchChildren(parent, oldInput, newV.props?.children ?? null, ctx, oldRange)
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

    // id 传递 + 注册
    if (oldV?.type === newV.type && oldV._id) {
      newV._id = oldV._id
      ctx.registry.idRegistry.set(newV._id, newV)
    }
    newV._parentNode = parent
    if (oldNode) newV._refNode = oldNode

    // 三态 skip：同类型 + props 同 + 无 dirty + 版本同 + 已构建 → 复用旧 _child
    // （必须同类型——导航 A→B 不同组件不得 skip，否则复用 A 的 _child → 页面不切换）
    const typeSame = oldV?.type === newV.type
    const propsSame = componentPropsEqual(oldV?.props ?? {}, newV.props ?? {})
    const dirty = newV._id ? ctx.dirtySet?.has(newV._id) : false
    const ver = ctx.getCtxVersion ? ctx.getCtxVersion(newV._id ?? '') : undefined
    const verSame = ver === undefined || (ctx.ctxVersion ?? 0) === ver
    if (oldV && typeSame && propsSame && !dirty && verSame && oldV._child !== undefined) {
      newV._child = oldV._child
      return oldNode
    }

    // 渲染输出（_render 同步——buildVNode 已展开 _child 优先）
    let childNew: VNodeChild
    if (newV._child !== undefined) {
      childNew = newV._child
    } else {
      childNew = newV._render!(newV.props)
      newV._child = childNew
    }
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
  const node = renderValue(newV, ctx, ctx.browser)
  if (node == null) return null
  if (oldNode?.parentNode) oldNode.parentNode.replaceChild(node, oldNode)
  else parent.appendChild(node)
  return node
}

/** 属性 patch（只设不删语义保持简单；差异删除由 diff 上层处理） */
export function patchProps(el: Element, oldProps: Record<string, any>, newProps: Record<string, any>): void {
  const allKeys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)])
  for (const key of allKeys) {
    if (key === 'children' || key === 'key') continue
    const ov = oldProps[key]
    const nv = newProps[key]
    if (ov === nv) continue
    if (nv == null || nv === false) {
      // 移除
      if (key === 'class' || key === 'className') { el.removeAttribute('class') }
      else if (key.startsWith('on')) { el.removeEventListener(key.slice(2).toLowerCase(), ov) }
      else if (key === 'ref') { if (typeof ov === 'function') ov(null) }
      else if (key === 'value') { (el as HTMLInputElement).value = '' }
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

  // 映射旧 DOM 范围（文本/null 用 source 位置；组件用 _refNode 精确）
  const oldNodes: (Node | null)[] = oldChildren.map((c, i) => {
    if (c == null || typeof c !== 'object' || Array.isArray(c)) return source[i] ?? null
    const vn = c as VNode
    if (vn._placement === 'remote') return (vn._remoteEl ?? null) as Node | null
    if (vn.type === Fragment) return vn._childNodes?.[0] ?? null
    return vn._refNode ?? vn.el ?? null
  })

  const allUnkeyed = !newChildren.some((c) => getKey(c) !== undefined)

  if (allUnkeyed) {
    // 无 key：按位置匹配（不移动 DOM）
    const len = Math.max(oldChildren.length, newChildren.length)
    const out: (Node | null)[] = []
    for (let i = 0; i < len; i++) {
      const oldC = i < oldChildren.length ? oldChildren[i] : null
      const newC = i < newChildren.length ? newChildren[i] : null
      if (newC == null || typeof newC === 'boolean') {
        const on = oldNodes[i]
        if (on?.parentNode) on.parentNode.removeChild(on)
        out.push(null)
        continue
      }
      if (oldC == null || typeof oldC === 'boolean') {
        // 新增：渲染 + 插到下一个兄弟前（位置正确）
        const node = renderValue(newC, ctx, ctx.browser)
        if (node == null) { out.push(null); continue }
        let next: Node | null = null
        for (let j = i + 1; j < oldNodes.length; j++) {
          const n = oldNodes[j]
          if (n && n.parentNode === parent) { next = n; break }
        }
        if (next && next.parentNode === parent) parent.insertBefore(node, next)
        else parent.appendChild(node)
        out.push(node)
        continue
      }
      const node = patchValue(parent, oldNodes[i], oldC, newC, ctx)
      out.push(node)
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
  newChildren.forEach((c, i) => {
    const k = getKey(c)
    const newV = c as VNode
    if (k !== undefined && oldKeyMap.has(k)) {
      const entry = oldKeyMap.get(k)!
      const oldNode = entry.nodes[0] ?? null
      movedKeys.add(k)
      const node = patchValue(parent, oldNode, entry.vnode, newV, ctx)
      out.push(node)
    } else {
      // 新增
      const node = renderValue(newV, ctx, ctx.browser)
      out.push(node)
      if (node != null) parent.appendChild(node)
    }
  })
  // 删除未移动的旧节点
  oldChildren.forEach((c, i) => {
    const k = getKey(c)
    if (k !== undefined && !movedKeys.has(k)) {
      const on = oldNodes[i]
      if (on?.parentNode) on.parentNode.removeChild(on)
    } else if (k === undefined) {
      const on = oldNodes[i]
      if (on?.parentNode) on.parentNode.removeChild(on)
    }
  })
  return out
}
