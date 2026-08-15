/**
 * vdom3 render — 渲染执行器：**构建后的纯树** → 事件流 → DOM
 *
 * 核心：**渲染即事件**——节点创建/属性设置/文本更新/插入/移除都是事件（stream.emit），
 * 执行器消费事件操作 DOM。DOM = fold(事件流)。
 *
 * 组件 vnode（已 build）：输出 _child（渲染组件输出——无重复构建）；
 * 卸载：COMP_UNMOUNT 事件（类型/位置变化时——由 patch 顶层判定）。
 */

import type { VNode, VNodeChild, PortalVNode } from './types.ts'
import { Fragment, Portal, childrenOf } from './types.ts'

/** SVG 元素集合（createElementNS——SVG 命名空间：属性大小写敏感（viewBox 等）） */
const SVG_TAGS = new Set([
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs',
  'use', 'text', 'tspan', 'ellipse', 'title', 'desc', 'marker', 'symbol',
  'linearGradient', 'radialGradient', 'stop', 'mask', 'pattern', 'clipPath',
])

/** Portal 判定（symbol 恒等 + props.portalKey——兼容 vdom2 组件产出的 Portal vnode） */
export function isPortalNode(v: unknown): v is PortalVNode {
  if (v == null || typeof v !== 'object') return false
  const t = (v as VNode).type
  return t === Portal || (typeof t === 'symbol' && (v as VNode).props?.portalKey != null)
}
/** Fragment 判定（symbol 且非 Portal——vdom2/vdom3 Fragment 都认） */
export function isFragmentNode(v: unknown): boolean {
  if (v == null || typeof v !== 'object') return false
  const t = (v as VNode).type
  return (t === Fragment || typeof t === 'symbol') && (v as VNode).props?.portalKey == null
}
import { stream, nextNodeId } from './events.ts'
import { NodeRegistry, ensurePortalContainer } from './registry.ts'
import { runUnmountHooks, isVNode } from './build.ts'
import { auditOrder } from './audit.ts'

/** 节点注册表（id ↔ Node——事件流指令定位）——模块级可变（mount/patch 支持
 *  per-call 注入（测试隔离）——同步段切换安全（并发交错在 await 点） */
let registry = new NodeRegistry()
export { registry }

/** 挂载：纯树 → 事件流 → DOM（reg 可选——per-call 隔离；默认全局）
 *  挂载前清空容器（首次挂载语义——清除 HTML 预置的 boot-loading 等占位——
 *  不残留「加载中...」） */
export function mount(vnode: VNode, root: HTMLElement, reg?: NodeRegistry): void {
  const prev = registry
  if (reg) registry = reg
  try {
    root.innerHTML = ''
    registry.register(NodeRegistry.ROOT, root) // root id 映射（事件流 parent 定位）
    renderVNode(vnode, root)
  } finally {
    registry = prev
  }
}

/** 渲染 vnode（同步——树已构建） */
function renderVNode(vnode: VNode, parent: Node, anchor?: Node | null): Node | null {
  // 组件：输出 _child（已构建——直接渲染输出；el 定位组件输出首节点）
  if (typeof vnode.type === 'function') {
    // _child 权威（build 设置——null 是合法输出（条件移除）；undefined = 未 build → fallback）
    const output = vnode._child !== undefined ? vnode._child : childrenOf(vnode)[0] ?? null
    if (output == null) return null
    // 已渲染（isConnected（真实 DOM/portal 容器）或 el 在父内（测试容器未连接））→ 复用
    if (vnode.el != null && (vnode.el.isConnected || vnode.el.parentNode === parent)) return vnode.el
    const node = renderVNode(output as VNode, parent, anchor)
    vnode.el = node
    return node
  }
  if (isFragmentNode(vnode)) {
    let first: Node | null = null
    for (const c of childrenOf(vnode)) {
      const n = renderVNodeChild(c, parent, anchor)
      if (n && !first) first = n
    }
    return first
  }
  if (isPortalNode(vnode)) {
    // portal：渲染到远程容器（#__wf_portal > [data-wf-portal-key]——脱离父节点位置）
    const pv = vnode as PortalVNode
    const portalKey = String(pv.props?.portalKey ?? 'default')
    const container = ensurePortalContainer(portalKey)
    // 容器 id 注册（事件流 parent 用 portal:key——idOf 经 WeakMap 解析）
    registry.register(NodeRegistry.PORTAL(portalKey), container)
    let first: Node | null = null
    for (const c of childrenOf(vnode)) {
      const n = renderVNodeChild(c, container)
      if (n && !first) first = n
    }
    vnode.el = container
    return first ?? container
  }
  // native（SVG 命名空间——Icon/图表组件的 svg/path 等：HTML createElement 的
  // svg 无 SVG 语义（属性解析小写化——viewBox 失效/不渲染））
  const tag = vnode.type as string
  const el = SVG_TAGS.has(tag)
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag)
  const id = nextNodeId()
  el.setAttribute('data-v3-id', id)
  registry.register(id, el)
  vnode.el = el
  stream.emit({ type: 'NODE_CREATE', id, tag: vnode.type as string, ts: Date.now() })
  for (const [key, val] of Object.entries(vnode.props ?? {})) {
    if (key === 'key' || key === 'children' || key === 'ref') continue
    if (typeof val === 'function' && /^on[A-Z]/.test(key)) {
      const evtKeys = ((el as Element & { __v3evtKeys?: Set<string> }).__v3evtKeys ??= new Set<string>())
      if (!evtKeys.has(key)) { // 按 key 防重复（多事件全绑定——首事件后不再跳过后续）
        el.addEventListener(key.slice(2).toLowerCase(), (e) => (val as (e: Event) => void)(e))
        evtKeys.add(key)
      }
      continue
    }
    if (val != null && val !== false) {
      if (key === 'value' && el instanceof HTMLInputElement) el.value = String(val)
      else if (key === 'style' && typeof val === 'object' && !Array.isArray(val)) {
        // style 对象 → cssText（camelCase → kebab-case）
        const css = Object.entries(val as Record<string, unknown>)
          .filter(([, v]) => v != null && v !== false)
          .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`).join(';')
        el.setAttribute('style', css)
      } else el.setAttribute(key, String(val))
      stream.emit({ type: 'PROP_UPDATE', target: id, key, value: val, prev: '', ts: Date.now() })
    }
  }
  if (anchor && anchor.parentNode === parent) parent.insertBefore(el, anchor)
  else parent.appendChild(el)
  stream.emit({ type: 'INSERT', parent: parentId(parent), child: id, ref: anchor ? nodeId(anchor) : null, ts: Date.now() })
  // ref 回调（挂载——稳定 ref 定义在 mount 层——§5.1 纪律）
  const refFn = vnode.props?.ref
  if (typeof refFn === 'function') refFn(el)
  for (const c of childrenOf(vnode)) renderVNodeChild(c, el)
  return el
}

function renderVNodeChild(c: VNodeChild, parent: Node, anchor?: Node | null): Node | null {
  if (c == null || c === false || c === true) return null
  if (typeof c === 'string' || typeof c === 'number') {
    const t = document.createTextNode(String(c))
    const id = nextNodeId()
    registry.register(id, t)
    stream.emit({ type: 'TEXT_CREATE', id, value: String(c), ts: Date.now() })
    if (anchor && anchor.parentNode === parent) parent.insertBefore(t, anchor)
    else parent.appendChild(t)
    stream.emit({ type: 'INSERT', parent: parentId(parent), child: id, ref: anchor ? nodeId(anchor) : null, ts: Date.now() })
    return t
  }
  return renderVNode(c, parent, anchor)
}

/**
 * patch：旧树（纯）vs 新树（纯）→ 事件流 → DOM。
 * 同位置同类型（含 key）复用——仅变化发事件；异类型 → REMOVE+CREATE+INSERT（重建事件）。
 */
export function patch(oldV: VNode | null, newV: VNodeChild, parent: Node, anchor?: Node | null, reg?: NodeRegistry): Node | null {
  const prev = registry
  if (reg) registry = reg
  try {
    return patchInner(oldV, newV, parent, anchor)
  } finally {
    registry = prev
  }
}

function patchInner(oldV: VNode | null, newV: VNodeChild, parent: Node, anchor?: Node | null): Node | null {
  // 文本
  if (typeof newV === 'string' || typeof newV === 'number') {
    const str = String(newV)
    const existing = oldV && typeof oldV === 'object' ? oldV.el : (parent.childNodes[0] ?? null)
    if (existing && existing.nodeType === 3) {
      if (existing.nodeValue !== str) {
        stream.emit({ type: 'TEXT_UPDATE', target: nodeId(existing), value: str, prev: existing.nodeValue ?? '', ts: Date.now() })
        existing.nodeValue = str
      }
      return existing
    }
    const t = document.createTextNode(str)
    const id = nextNodeId()
    registry.register(id, t)
    stream.emit({ type: 'TEXT_CREATE', id, value: str, ts: Date.now() })
    if (anchor && anchor.parentNode === parent) parent.insertBefore(t, anchor)
    else parent.appendChild(t)
    stream.emit({ type: 'INSERT', parent: parentId(parent), child: id, ref: anchor ? nodeId(anchor) : null, ts: Date.now() })
    return t
  }
  if (newV == null || newV === false || newV === true) {
    if (oldV != null && oldV.el && oldV.el.parentNode === parent) {
      const id = registry.idOf(oldV.el)
      stream.emit({ type: 'REMOVE', parent: parentId(parent), child: id, ts: Date.now() })
      oldV.el.parentNode?.removeChild(oldV.el)
      registry.unregister(id, oldV.el)
    }
    return null
  }
  // vnode
  const vn = newV
  const oldIsVNode = oldV != null && typeof oldV === 'object' && 'type' in oldV
  const sameType = oldIsVNode && (oldV as VNode).type === vn.type && (oldV as VNode).key === vn.key

  if (sameType) {
    const ov = oldV as VNode
    // portal：内容 patch 到远程容器（同 key 复用）
    if (isPortalNode(vn)) {
      const portalKey = String(vn.props?.portalKey ?? 'default')
      const container = ensurePortalContainer(portalKey)
      registry.register(NodeRegistry.PORTAL(portalKey), container)
      patchChildren(ov, vn, container)
      vn.el = container
      return container
    }
    // 组件：复用实例（_render 保持）——输出已由 build 更新（新 _child）——渲染新输出
    if (typeof vn.type === 'function') {
      vn._render = ov._render
      vn._id = ov._id
      const out = vn._child !== undefined ? vn._child : childrenOf(vn)[0] ?? null
      const oldOut = ov._child !== undefined ? ov._child : childrenOf(ov)[0] ?? null
      if (out == null) {
        if (ov.el) { ov.el.parentNode?.removeChild(ov.el); ov.el = null }
        vn.el = null
        return null
      }
      if (ov.el == null || !(ov.el.isConnected || ov.el.parentNode === parent)) {
        vn.el = renderVNode(vn, parent, anchor)
      } else {
        // 组件输出变化 → patch 子树（组件 el 保持——输出首节点定位）
        patch(oldOut as VNode | null, out as VNodeChild, parent, anchor)
        vn.el = ov.el
      }
      return vn.el
    }
    // native：属性 diff + children patch
    const el = ov.el as Element
    vn.el = el
    patchProps(el, ov.props, vn.props)
    patchChildren(ov, vn, el)
    return el
  }

  // 异类型：旧组件 → COMP_UNMOUNT；移除旧 + 渲染新
  if (oldIsVNode && typeof (oldV as VNode).type === 'function' && (oldV as VNode)._id) {
    runUnmountHooks((oldV as VNode)._id!)
    stream.emit({ type: 'COMP_UNMOUNT', id: (oldV as VNode)._id!, name: compName((oldV as VNode).type), ts: Date.now() })
  }
  if (oldIsVNode) {
    const oldEl = (oldV as VNode).el
    if (oldEl && oldEl.parentNode === parent) {
      const oldRef = (oldV as VNode).props?.ref
      if (typeof oldRef === 'function') oldRef(null)
      const rid = registry.idOf(oldEl)
      stream.emit({ type: 'REMOVE', parent: parentId(parent), child: rid, ts: Date.now() })
      oldEl.parentNode?.removeChild(oldEl)
      registry.unregister(rid, oldEl)
    } else if (oldV && isPortalNode(oldV)) {
      // 旧 portal：清空远程容器（内容全移除——子树 REMOVE 事件）
      removePortalContent(oldV as PortalVNode)
    }
  }
  return renderVNode(vn, parent, anchor)
}

/** 属性 diff（同类型复用——仅变化发事件） */
function patchProps(el: Element, oldProps: Record<string, unknown>, newProps: Record<string, unknown>): void {
  const target = nodeId(el)
  const allKeys = new Set([...Object.keys(oldProps ?? {}), ...Object.keys(newProps ?? {})])
  // ref 切换（引用变化 → 旧(null) + 新(el)——稳定 ref 不重绑）
  const oldRef = oldProps?.ref
  const newRef = newProps?.ref
  if (oldRef !== newRef) {
    if (typeof oldRef === 'function') oldRef(null)
    if (typeof newRef === 'function') newRef(el)
  }
  for (const key of allKeys) {
    if (key === 'key' || key === 'children' || key === 'ref') continue
    const ov = oldProps?.[key]
    const nv = newProps?.[key]
    if (ov === nv) continue
    if (typeof nv === 'function' && /^on[A-Z]/.test(key)) {
      const evtKeys = ((el as Element & { __v3evtKeys?: Set<string> }).__v3evtKeys ??= new Set<string>())
      if (!evtKeys.has(key)) { // 按 key 防重复（同一 key 已绑定跳过——新 key 绑定）
        el.addEventListener(key.slice(2).toLowerCase(), (e) => (nv as (e: Event) => void)(e))
        evtKeys.add(key)
      }
      continue
    }
    if (nv == null || nv === false) {
      if (key === 'value' && el instanceof HTMLInputElement) (el as HTMLInputElement).value = ''
      else el.removeAttribute(key)
    } else if (key === 'value' && el instanceof HTMLInputElement) {
      ;(el as HTMLInputElement).value = String(nv)
    } else if (key === 'style' && typeof nv === 'object' && !Array.isArray(nv)) {
      const css = Object.entries(nv as Record<string, unknown>)
        .filter(([, v]) => v != null && v !== false)
        .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`).join(';')
      el.setAttribute('style', css)
    } else {
      el.setAttribute(key, String(nv))
    }
    stream.emit({ type: 'PROP_UPDATE', target, key, value: nv, prev: ov ?? '', ts: Date.now() })
  }
}

/** keyed 移动（重排优化）：新 key 在旧列表存在 → 按新顺序移动（prevNode 跟踪——连续重排正确） */
function moveKeyedNodes(oldKids: VNodeChild[], newKids: VNodeChild[], el: Element): void {
  const oldKeyIdx = new Map<string, number>()
  oldKids.forEach((k, i) => {
    if (isVNode(k) && k.key != null) oldKeyIdx.set(k.key, i)
  })
  let prevNode: Node | null = null // 新序列中前一个已处理项的 DOM（期望位置锚）
  for (let i = 0; i < newKids.length; i++) {
    const nc = newKids[i]
    if (!isVNode(nc) || nc.key == null) { prevNode = null; continue }
    const oi = oldKeyIdx.get(nc.key)
    let elNode: Node | null = null
    if (oi != null && isVNode(oldKids[oi])) elNode = (oldKids[oi] as VNode).el ?? null
    if (elNode && elNode.parentNode === el) {
      const target: Node | null = prevNode ? prevNode.nextSibling : el.firstChild
      if (target !== elNode) {
        const prev = elNode.previousSibling ? registry.idOf(elNode.previousSibling) : null
        el.insertBefore(elNode, target)
        stream.emit({ type: 'MOVE', node: registry.idOf(elNode), parent: nodeId(el), ref: target ? registry.idOf(target) : null, prev, ts: Date.now() })
      }
      prevNode = elNode
    }
  }
}

/** 全 keyed 列表 diff：DOM 移动（MOVE 事件）+ 按 key 配对 patch + 新增/移除 */
function patchKeyedChildren(oldKids: VNodeChild[], newKids: VNodeChild[], el: Element): void {
  const oldMap = new Map<string, VNode>()
  for (const k of oldKids) if (isVNode(k) && k.key != null) oldMap.set(k.key, k)
  // 新顺序移动 DOM（MOVE 事件——重排不重建）
  moveKeyedNodes(oldKids, newKids, el)
  // 按新顺序 patch（同 key 复用；新 key 创建——插到 prev 之后；DOM 锚 = prev 后）
  let prev: Node | null = null
  for (const nc of newKids) {
    const nv = nc as VNode
    const oc = oldMap.get(nv.key ?? '') ?? null
    if (oc && oc !== nv) {
      patch(oc, nv, el)
      prev = nv.el ?? prev
    } else if (!oc) {
      renderVNode(nv, el, prev ? prev.nextSibling : el.firstChild)
      prev = nv.el ?? prev
    }
  }
  // 移除无新 key 的旧项
  const newKeys = new Set(newKids.filter((k) => isVNode(k)).map((k) => (k as VNode).key))
  for (const ok of oldKids) {
    if (isVNode(ok) && ok.key != null && !newKeys.has(ok.key) && ok.el?.parentNode === el) {
      const id = registry.idOf(ok.el)
      stream.emit({ type: 'REMOVE', parent: nodeId(el), child: id, ts: Date.now() })
      ok.el.parentNode?.removeChild(ok.el)
      registry.unregister(id, ok.el)
    }
  }
}

/** 移除 portal 内容（远程容器清空——子树 REMOVE 事件） */
function removePortalContent(pv: PortalVNode): void {
  const portalKey = String(pv.props?.portalKey ?? 'default')
  const container = ensurePortalContainer(portalKey)
  for (const child of [...container.childNodes]) {
    const cid = registry.idOf(child)
    stream.emit({ type: 'REMOVE', parent: NodeRegistry.PORTAL(portalKey), child: cid, ts: Date.now() })
    container.removeChild(child)
    registry.unregister(cid, child)
  }
}

/** children diff：全 keyed → 专用路径（MOVE）；无 key/混合 → 位置配对 */
function patchChildren(oldV: VNode, newV: VNode, el: Element): void {
  const oldKids = childrenOf(oldV)
  const newKids = childrenOf(newV)
  // 全 keyed 列表（>1 项且全部有 key）→ keyed diff（重排 MOVE——DOM 状态保持）
  if (newKids.length > 1 && newKids.every((k) => isVNode(k) && k.key != null)) {
    patchKeyedChildren(oldKids, newKids, el)
    return
  }

  // prevNode 锚：新项插入到前一个已渲染兄弟之后（空洞（false）不产生 DOM——
  // childNodes 索引与 children 错位——prevNode 保证 vnode 顺序 = DOM 顺序）
  let prevNode: Node | null = null
  const len = Math.max(oldKids.length, newKids.length)
  for (let i = 0; i < len; i++) {
    const oc = i < oldKids.length ? oldKids[i] : null
    const nc = i < newKids.length ? newKids[i] : null
    if (i >= newKids.length) {
      if (oc != null && typeof oc === 'object' && isPortalNode(oc)) {
        removePortalContent(oc as PortalVNode)
        continue
      }
      if (oc != null && typeof oc === 'object' && (oc as VNode).el) {
        const oldRef = (oc as VNode).props?.ref
        if (typeof oldRef === 'function') oldRef(null)
        const elNode = (oc as VNode).el!
        const rid = registry.idOf(elNode)
        stream.emit({ type: 'REMOVE', parent: nodeId(el), child: rid, ts: Date.now() })
        elNode.parentNode?.removeChild(elNode)
        registry.unregister(rid, elNode)
      } else {
        const domNode = el.childNodes[i]
        if (domNode) domNode.parentNode?.removeChild(domNode)
      }
      continue
    }
    if (typeof nc === 'string' || typeof nc === 'number') {
      const str = String(nc)
      const existing = el.childNodes[i]
      if (existing && existing.nodeType === 3) {
        if (existing.nodeValue !== str) {
          stream.emit({ type: 'TEXT_UPDATE', target: nodeId(existing), value: str, prev: existing.nodeValue ?? '', ts: Date.now() })
          existing.nodeValue = str
        }
      } else {
        const t = document.createTextNode(str)
        const id = nextNodeId()
        registry.register(id, t)
        stream.emit({ type: 'TEXT_CREATE', id, value: str, ts: Date.now() })
        el.insertBefore(t, el.childNodes[i] ?? null)
        stream.emit({ type: 'INSERT', parent: nodeId(el), child: id, ref: null, ts: Date.now() })
      }
      continue
    }
    if (nc == null || nc === false || nc === true) {
      if (oc != null && typeof oc === 'object' && isPortalNode(oc)) {
        removePortalContent(oc as PortalVNode)
        continue
      }
      // 移除（含 ref(null)——卸载清理）；oc 无 el（空洞）跳过——不碰 childNodes[i]
      if (oc != null && typeof oc === 'object' && (oc as VNode).el) {
        const oldRef = (oc as VNode).props?.ref
        if (typeof oldRef === 'function') oldRef(null)
        const elNode = (oc as VNode).el!
        const rid = registry.idOf(elNode)
        stream.emit({ type: 'REMOVE', parent: nodeId(el), child: rid, ts: Date.now() })
        elNode.parentNode?.removeChild(elNode)
        registry.unregister(rid, elNode)
      }
      continue
    }
    if (oc != null && typeof oc === 'object') {
      patch(oc as VNode, nc as VNode, el)
      const patched = (nc as VNode).el
      if (patched && patched.parentNode === el) prevNode = patched
    } else {
      // 新项：渲染（组件输出已在 build 展开）——prevNode 锚（空洞后插入位置正确）
      const anchor = prevNode ? prevNode.nextSibling : el.firstChild
      const node = renderVNode(nc as VNode, el, anchor)
      if (node && node.parentNode === el) prevNode = node
    }
  }
  auditOrder(el, newV)
}

function compName(type: unknown): string {
  return typeof type === 'function' ? (type.name || 'anonymous') : String(type)
}

function nodeId(n: Node | null): string {
  return registry.idOf(n)
}

function parentId(p: Node): string {
  return registry.idOf(p)
}

export { Fragment }
