/**
 * vdom3 render — 渲染执行器：**构建后的纯树** → 事件流 → DOM
 *
 * 核心：**渲染即事件**——节点创建/属性设置/文本更新/插入/移除都是事件（stream.emit），
 * 执行器消费事件操作 DOM。DOM = fold(事件流)。
 *
 * 组件 vnode（已 build）：输出 _child（渲染组件输出——无重复构建）；
 * 卸载：COMP_UNMOUNT 事件（类型/位置变化时——由 patch 顶层判定）。
 */

import type { VNode, VNodeChild, FlatChild, PortalVNode, VKind } from './types.ts'
import { Fragment, Portal, App, childrenOf, classifyKind } from './types.ts'

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
import { stream, ev, nextNodeId } from './events.ts'
import { bindDelegated, unbindAll, unbindEvent, ensureDelegationRoot } from './delegate.ts'
import { unindexComponent } from './comp-index.ts'
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
    // 事件代理根（任何挂载点——含测试基建 mountToDom——挂载即注册监听）
    ensureDelegationRoot(root)
    root.innerHTML = ''
    registry.register(NodeRegistry.ROOT, root) // root id 映射（事件流 parent 定位）
    renderVNode(vnode, root)
  } finally {
    registry = prev
  }
}

/** 渲染 vnode（同步——树已构建） */
function renderVNode(vnode: VNode, parent: Node, anchor?: Node | null): Node | null {
  // 组件/app 节点：输出 _child（已构建——直接渲染输出；el 定位组件输出首节点）
  if (typeof vnode.type === 'function' || vnode.type === App) {
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
    // 事件代理根（portal 容器——内容冒泡到容器——按钮点击等事件分发的挂载点）
    ensureDelegationRoot(container)
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
  stream.emit(ev('node', 'create', id, { tag: vnode.type as string }))
  for (const [key, val] of Object.entries(vnode.props ?? {})) {
    if (key === 'key' || key === 'children' || key === 'ref') continue
    if (typeof val === 'function' && /^on[A-Z]/.test(key)) {
      // 事件代理：handler 注册到代理注册表（按节点 id——Map 覆盖零重绑）——
      // 挂载点监听惰性注册（每挂载点每事件一次——EVENT_BIND 由代理发）
      bindDelegated(id, key.slice(2).toLowerCase(), val as EventListener, parent)
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
      stream.emit(ev('prop', 'update', id, { key, value: val, prev: '' }))
    }
  }
  if (anchor && anchor.parentNode === parent) parent.insertBefore(el, anchor)
  else parent.appendChild(el)
  stream.emit(ev('node', 'insert', id, { parent: parentId(parent), ref: anchor ? nodeId(anchor) : null }))
  // ref 回调（挂载——稳定 ref 定义在 mount 层——§5.1 纪律）——
  // ref:mount 事件（组件副作用开始点——拿到 el 后组件可能操作 DOM——可观测）
  const refFn = vnode.props?.ref
  if (typeof refFn === 'function') {
    stream.emit(ev('ref', 'mount', id, {}))
    refFn(el)
  }
  for (const c of childrenOf(vnode)) renderVNodeChild(c, el)
  return el
}

function renderVNodeChild(c: FlatChild, parent: Node, anchor?: Node | null): Node | null {
  if (c == null || c === false || c === true) return null
  if (typeof c === 'string' || typeof c === 'number') {
    const t = document.createTextNode(String(c))
    const id = nextNodeId()
    registry.register(id, t)
    stream.emit(ev('text', 'create', id, { value: String(c) }))
    if (anchor && anchor.parentNode === parent) parent.insertBefore(t, anchor)
    else parent.appendChild(t)
    stream.emit(ev('node', 'insert', id, { parent: parentId(parent), ref: anchor ? nodeId(anchor) : null }))
    return t
  }
  return renderVNode(c, parent, anchor)
}

/**
 * patch：旧树（纯）vs 新树（纯）→ 事件流 → DOM。
 * 同位置同类型（含 key）复用——仅变化发事件；异类型 → REMOVE+CREATE+INSERT（重建事件）。
 */
export function patch(oldV: VNode | null, newV: VNode | string | number | null | undefined | boolean, parent: Node, anchor?: Node | null, reg?: NodeRegistry): Node | null {
  const prev = registry
  if (reg) registry = reg
  try {
    // 结构共享快路径：同引用（build 复用旧树节点）→ 零 diff 零事件（静态分支）
    if (oldV !== null && newV !== null && typeof oldV === 'object' && typeof newV === 'object' && oldV === newV) {
      return (oldV as VNode).el ?? null
    }
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
        stream.emit(ev('text', 'update', nodeId(existing), { value: str, prev: existing.nodeValue ?? '' }))
        existing.nodeValue = str
      }
      return existing
    }
    const t = document.createTextNode(str)
    const id = nextNodeId()
    registry.register(id, t)
    stream.emit(ev('text', 'create', id, { value: str }))
    if (anchor && anchor.parentNode === parent) parent.insertBefore(t, anchor)
    else parent.appendChild(t)
    stream.emit(ev('node', 'insert', id, { parent: parentId(parent), ref: anchor ? nodeId(anchor) : null }))
    return t
  }
  if (newV == null || newV === false || newV === true) {
    if (oldV != null && typeof oldV === 'object' && !Array.isArray(oldV)) {
      // 输出变 null（条件移除）——统一生命周期清理。Portal 输出的 el 为 null
      // （内容独立挂载）——走 removePortalContent（Tour 完成关闭等嵌套组件
      // 输出 null 路径——此前只处理 oldV.el → portal 内容残留）
      if (isPortalNode(oldV)) {
        removePortalContent(oldV as PortalVNode)
      } else if (oldV.el && oldV.el.parentNode === parent) {
        const id = registry.idOf(oldV.el)
        stream.emit(ev('node', 'remove', id, { parent: parentId(parent) }))
        oldV.el.parentNode?.removeChild(oldV.el)
        registry.unregister(id, oldV.el)
      }
    }
    return null
  }
  // vnode（text/null 分支已 return——此处必为 vnode）
  const vn = newV as VNode
  const oldIsVNode = oldV != null && typeof oldV === 'object' && 'type' in oldV
  const sameType = oldIsVNode && (oldV as VNode).type === vn.type && (oldV as VNode).key === vn.key

  if (sameType) {
    const ov = oldV as VNode
    const kind = classifyKind(vn)
    emitPatch(oldIsVNode ? classifyKind(oldV) : null, kind, 'reuse')
    const patcher = KIND_PATCHERS[kind]
    if (!patcher) {
      // kind 处理器缺注册：明确失败（PATCH 事件 + warn——不再是静默崩进默认路径）
      emitPatch(oldIsVNode ? classifyKind(oldV) : null, kind, 'unhandled')
      console.warn(`[vdom3/patch] kind=${kind} 无同类型处理器——降级重建（kind 分发完整性缺失）`)
      return renderVNode(vn, parent, anchor)
    }
    return patcher(ov, vn, parent, anchor)
  }

  // 异类型：rebuild（PATCH 决策事件——异类型走通用重建——不依赖 kind 组合矩阵）
  emitPatch(oldIsVNode ? classifyKind(oldV) : null, classifyKind(vn), 'rebuild')
  // 旧组件 → COMP_UNMOUNT；移除旧 + 渲染新
  if (oldIsVNode && typeof (oldV as VNode).type === 'function' && (oldV as VNode)._id) {
    runUnmountHooks((oldV as VNode)._id!)
    stream.emit(ev('comp', 'unmount', (oldV as VNode)._id!, { name: compName((oldV as VNode).type) }))
  }
  if (oldIsVNode) {
    const oldEl = (oldV as VNode).el
    if (oldEl && oldEl.parentNode === parent) {
      // 统一生命周期清理（REMOVE + EVENT_UNBIND + REF_CLEANUP）
      removeNodeWithLifecycle(oldEl, parent, oldV as VNode)
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
    // 对象属性浅比较（style 等——每次渲染新对象——值相同不重设——
    // 零变化零事件——避免全树 style 写入导致的布局抖动；key 级比较无序列化开销）
    if (ov != null && nv != null && typeof ov === 'object' && typeof nv === 'object'
        && !Array.isArray(ov) && !Array.isArray(nv)
        && shallowEqual(ov as Record<string, unknown>, nv as Record<string, unknown>)) continue
    if (typeof nv === 'function' && /^on[A-Z]/.test(key)) {
      // 事件代理：handler 更新 = Map 覆盖（零重绑零事件——事件流零噪音；
      // 稳定引用（§5.1）仅为性能建议——非正确性要求）
      bindDelegated(target, key.slice(2).toLowerCase(), nv as EventListener, el)
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
    stream.emit(ev('prop', 'update', target, { key, value: nv, prev: ov ?? '' }))
  }
}

/** PATCH 决策事件（全链路事件流——kind 分发可观测/可断言） */
function emitPatch(oldKind: VKind | null, newKind: VKind, action: 'reuse' | 'rebuild' | 'move' | 'remove' | 'unhandled'): void {
  stream.emit(ev('vnode', 'patch', undefined, { oldKind, newKind, strategy: action }))
}

// ── kind 同类型处理器表（kind → 复用路径——显式注册——缺注册明确失败） ──

/** native：属性 diff + children patch（el 守卫——ov.el 缺失 → 明确失败 + 降级） */
function patchNativeKind(ov: VNode, vn: VNode, parent: Node, anchor?: Node | null): Node | null {
  const el = ov.el as Element | undefined
  if (el == null) {
    emitPatch(classifyKind(ov), 'native', 'unhandled')
    console.warn(`[vdom3/patch] native 复用但 ov.el 缺失（tag=${String(ov.type)}——kind 分发或渲染时序错误）——降级重建`)
    return renderVNode(vn, parent, anchor)
  }
  vn.el = el
  patchProps(el, ov.props, vn.props)
  patchChildren(ov, vn, el)
  return el
}

/** 组件：复用实例（_render 保持）——输出已由 build 更新——patch 子树 */
function patchCompKind(ov: VNode, vn: VNode, parent: Node, anchor?: Node | null): Node | null {
  vn._render = ov._render
  vn._id = ov._id
  // app 节点：输出 = _child（子应用根构建）——同组件路径
  const out = vn._child !== undefined ? vn._child : childrenOf(vn)[0] ?? null
  const oldOut = ov._child !== undefined ? ov._child : childrenOf(ov)[0] ?? null
  if (out == null) {
    // 注意：组件输出 null ≠ 组件从树中移除——实例保留（下次渲染输出恢复）——
    // 索引不注销（updateComponent 仍可 O(1) 定位）
    // 移除旧输出（统一生命周期清理——Portal 输出（el 为 null）走
    // removePortalContent：Tour 完成关闭等嵌套组件输出 null 的残留根因）
    if (oldOut && isPortalNode(oldOut)) {
      removePortalContent(oldOut as PortalVNode)
    } else if (ov.el) {
      // 递归 ref(null)——ref 纪律：lockScroll/focus 清理依赖
      // 卸载回调（usePopup 的 portalPanelRef → unlockScroll）
      callRefCleanup(oldOut as VNode | null)
      // 不变量：无事件流不渲染——移除必须入事件流（REMOVE——可观测）
      const rid = registry.idOf(ov.el)
      stream.emit(ev('node', 'remove', rid, { parent: parentId(parent) }))
      ov.el.parentNode?.removeChild(ov.el)
      registry.unregister(rid, ov.el)
      ov.el = null
    }
    vn.el = null
    return null
  }
  if (ov.el == null || !(ov.el.isConnected || ov.el.parentNode === parent)) {
    vn.el = renderVNode(vn, parent, anchor)
  } else {
    // 组件输出变化 → patch 子树（组件 el 保持——输出首节点定位）
    patch(oldOut as VNode | null, out as VNode, parent, anchor)
    vn.el = ov.el
  }
  return vn.el
}

/** Fragment：children 级 patch（Fragment 无自身 el——children 的 DOM 展开在父容器——
 *  baseIndex 对齐 Fragment 的起始位置（前后可有兄弟）） */
function patchFragKind(ov: VNode, vn: VNode, parent: Node, _anchor?: Node | null): Node | null {
  patchChildren(ov, vn, parent as Element, fragmentBaseIndex(ov))
  // Fragment 的 el = 首 child 的 el（组件输出定位）
  const firstChild = childrenOf(ov).find((c): c is VNode => c != null && typeof c === 'object' && !Array.isArray(c))
  vn.el = ov.el ?? (firstChild?.el ?? null)
  return vn.el
}

/** portal：内容 patch 到远程容器（同 key 复用） */
function patchPortalKind(ov: VNode, vn: VNode, _parent: Node, _anchor?: Node | null): Node | null {
  const portalKey = String(vn.props?.portalKey ?? 'default')
  const container = ensurePortalContainer(portalKey)
  registry.register(NodeRegistry.PORTAL(portalKey), container)
  patchChildren(ov, vn, container)
  vn.el = container
  return container
}

/** kind 同类型处理器表（显式注册——text/null 在 patchInner 入口已处理——此处占位） */
const KIND_PATCHERS: Partial<Record<VKind, (ov: VNode, vn: VNode, parent: Node, anchor?: Node | null) => Node | null>> = {
  native: patchNativeKind,
  comp: patchCompKind,
  app: patchCompKind, // app 节点同组件路径（输出 _child——子应用根）
  frag: patchFragKind,
  portal: patchPortalKind,
  text: undefined, // 入口已处理（TEXT_UPDATE）
  null: undefined, // 入口已处理（移除）
}

/** Fragment 首节点在父容器的索引（children patch 的 baseIndex——Fragment 的
 *  children 展开在父容器——位置可能非 0（前后有兄弟）——索引偏移对齐） */
function fragmentBaseIndex(ov: VNode): number {
  const firstChild = childrenOf(ov).find((c): c is VNode => c != null && typeof c === 'object' && !Array.isArray(c))
  const el0 = firstChild?.el
  const parent = el0?.parentNode
  if (parent && el0) {
    let idx = 0
    for (const n of parent.childNodes) {
      if (n === el0) return idx
      idx++
    }
  }
  return 0
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
        stream.emit(ev('node', 'move', registry.idOf(elNode), { parent: nodeId(el), ref: target ? registry.idOf(target) : null, prev }))
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
      stream.emit(ev('node', 'remove', id, { parent: nodeId(el) }))
      ok.el.parentNode?.removeChild(ok.el)
      registry.unregister(id, ok.el)
    }
  }
}

/** 递归调 ref(null)（移除树——ref 纪律：卸载清理（lockScroll/focus）依赖
 *  ——portal/组件输出等嵌套结构的 ref 全部清理——REF_CLEANUP 事件（生命周期可观测））
 *  导出（组件级 update 用） */
export function callRefCleanup(v: VNode | null | undefined): void {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return
  const refFn = (v as VNode).props?.ref
  if (typeof refFn === 'function') {
    // ref 生命周期事件（ref(null)——卸载清理可观测/可断言）
    const el = (v as VNode).el
    stream.emit(ev('ref', 'cleanup', el ? registry.idOf(el) : 'null'))
    refFn(null)
  }
  for (const c of childrenOf(v as VNode)) {
    if (c != null && typeof c === 'object' && !Array.isArray(c)) callRefCleanup(c as VNode)
  }
}


/** 组件实例从树中移除的统一清理（卸载钩子 + comp:unmount 事件 + 索引注销——
 *  条件渲染/列表删除路径——此前只 patch 顶层异类型移除有——泄漏：usePopup
 *  的 document 监听/tracker/定时器不退订） */
function removeComponentInstance(oc: VNode, el: Element, i: number): void {
  const compId = oc._id as string
  if (compId) {
    runUnmountHooks(compId)
    stream.emit(ev('comp', 'unmount', compId, { name: compName(oc.type) }))
    unindexComponent(compId)
  }
  if (oc.el) {
    removeNodeWithLifecycle(oc.el!, el, oc)
  } else {
    const domNode = el.childNodes[i]
    if (domNode) domNode.parentNode?.removeChild(domNode)
  }
}
/** 节点移除的完整清理（REMOVE 事件 + EVENT_UNBIND（绑定生命周期）+ ref(null) + registry） */
export function removeNodeWithLifecycle(node: Node, parent: Node, vnodeRef?: VNode | null): void {
  // 事件代理解绑（注册表删除 + EVENT_UNBIND——每事件可观测）
  unbindAll(registry.idOf(node))
  if (vnodeRef) callRefCleanup(vnodeRef)
  const rid = registry.idOf(node)
  stream.emit(ev('node', 'remove', rid, { parent: parentId(parent) }))
  node.parentNode?.removeChild(node)
  registry.unregister(rid, node)
}

/** 对象浅比较（key 级——style 等不嵌套——零变化零事件判定） */
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (a[k] !== b[k]) return false
  }
  return true
}

/** 移除 portal 内容（远程容器清空——子树 REMOVE 事件 + ref(null)——ref 纪律：
 *  卸载必须调 ref(null)（usePopup 的 portalPanelRef 清理——lockScroll/focus 恢复）） */
export function removePortalContent(pv: PortalVNode): void {
  const portalKey = String(pv.props?.portalKey ?? 'default')
  const container = ensurePortalContainer(portalKey)
  // 递归 ref(null)（面板根/嵌套的 ref——锁滚动/焦点清理依赖）+ EVENT_UNBIND
  callRefCleanup(pv)
  for (const child of [...container.childNodes]) {
    unbindAll(registry.idOf(child))
    const cid = registry.idOf(child)
    stream.emit(ev('node', 'remove', cid, { parent: NodeRegistry.PORTAL(portalKey) }))
    container.removeChild(child)
    registry.unregister(cid, child)
  }
}

/** children diff：全 keyed → 专用路径（MOVE）；无 key/混合 → 位置配对 */
/** children diff（el 父容器；baseIndex = 起始 childNodes 偏移——Fragment 的 children
 *  展开在父容器非 0 位——索引对齐） */
function patchChildren(oldV: VNode, newV: VNode, el: Element, baseIndex = 0): void {
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
      // 组件输出 Portal（oc._child 是 Portal——组件 el 为 null 此前跳过 →
      // portal 内容残留——多次条件切换后 DOM 与树不一致累积）
      if (oc != null && typeof oc === 'object' && (oc as VNode)._child && isPortalNode((oc as VNode)._child)) {
        removePortalContent((oc as VNode)._child as PortalVNode)
        continue
      }
      // 组件从树中移除——统一清理（卸载钩子 + comp:unmount + 索引注销）
      if (oc != null && typeof oc === 'object' && typeof (oc as VNode).type === 'function' && (oc as VNode)._id) {
        removeComponentInstance(oc as VNode, el, i)
        continue
      }
      // 统一生命周期清理（REMOVE + EVENT_UNBIND + REF_CLEANUP）
      if (oc != null && typeof oc === 'object' && (oc as VNode).el) {
        removeNodeWithLifecycle((oc as VNode).el!, el, oc as VNode)
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
          stream.emit(ev('text', 'update', nodeId(existing), { value: str, prev: existing.nodeValue ?? '' }))
          existing.nodeValue = str
        }
      } else {
        const t = document.createTextNode(str)
        const id = nextNodeId()
        registry.register(id, t)
        stream.emit(ev('text', 'create', id, { value: str }))
        el.insertBefore(t, el.childNodes[i] ?? null)
        stream.emit(ev('node', 'insert', id, { parent: nodeId(el), ref: null }))
      }
      continue
    }
    if (nc == null || nc === false || nc === true) {
      if (oc != null && typeof oc === 'object' && isPortalNode(oc)) {
        removePortalContent(oc as PortalVNode)
        continue
      }
      // 组件从树中移除——统一清理（卸载钩子 + comp:unmount + 索引注销——
      // 此前泄漏：条件渲染移除的组件 onUnmount 钩子不执行——监听/tracker 残留）
      if (oc != null && typeof oc === 'object' && typeof (oc as VNode).type === 'function' && (oc as VNode)._id) {
        removeComponentInstance(oc as VNode, el, i)
        continue
      }
      // 移除（含 ref(null)——卸载清理）；oc 无 el（空洞）跳过——不碰 childNodes[i]
      // 统一生命周期清理（REMOVE + EVENT_UNBIND + REF_CLEANUP）
      if (oc != null && typeof oc === 'object' && (oc as VNode).el) {
        removeNodeWithLifecycle((oc as VNode).el!, el, oc as VNode)
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
