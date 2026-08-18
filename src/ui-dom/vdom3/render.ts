/**
 * vdom3 render — 渲染执行器：**构建后的纯树** → 命令（diff 决策）→ 执行（apply）→ DOM
 *
 * vdom4 P0（命令化 diff）：决策与执行分离——
 *   gen 系列（diff）：读 vnode/DOM 状态 → 决策 → 生成 Command[]（**不写 DOM**）
 *   applyCommands（执行）：消费命令 → DOM 操作 + DOM 层事件流发射（单点）
 * 决策层事件（diff:transition/vnode:patch/diff:mode）在 gen 阶段发射（决策可观测）；
 * DOM 层事件（node:create/insert/remove/move/prop:update/text:update/ref/event/portal）
 * 统一在 apply 发射（命令是唯一执行依据——DOM = fold(命令)）。
 *
 * 命令引用协议：节点用 id（字符串——apply 时 registry 解析——新节点 gen 阶段
 * 尚未创建——必须 id 引用）；锚（ref）可以是旧 DOM 节点（Node）或新节点（id）。
 *
 * 组件 vnode（已 build）：输出 _child（渲染组件输出——无重复构建）；
 * 卸载：unmountComp 命令（COMP_UNMOUNT 事件——由 apply 执行清理）。
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

/**
 * input value 写入：property + range 同步 attribute。
 *
 * 浏览器表单状态恢复/默认值机制基于 value attribute 解析（defaultValue）——
 * 只设 property 时刷新后控件被恢复/重算为旧默认值，组件状态与原生 thumb 错位
 * （真实事故：components-demo 2000 slider 刷新后 input.value=100 而数值显示 800——
 * marker 与数值位置不一致）。text input 的 value attribute 语义是 defaultValue
 * （reset() 回退值）——不能动——仅 range 同步（受控组件 attribute 恒等于当前值）。
 */
function setInputValue(el: HTMLInputElement, val: string): void {
  el.value = val
  if (el.type === 'range') el.setAttribute('value', val)
}
/** Fragment 判定（symbol 且非 Portal——vdom2/vdom3 Fragment 都认） */
export function isFragmentNode(v: unknown): boolean {
  if (v == null || typeof v !== 'object') return false
  const t = (v as VNode).type
  return (t === Fragment || typeof t === 'symbol') && (v as VNode).props?.portalKey == null
}
import { stream, ev, nextNodeId } from './events.ts'
import { bindDelegated, unbindAll, ensureDelegationRoot, ensureDelegationFor, listenerCount } from './delegate.ts'
import { unindexComponent } from './comp-index.ts'
import { NodeRegistry, ensurePortalContainer } from './registry.ts'
import { runUnmountHooks, isVNode } from './build.ts'
import { auditOrder } from './audit.ts'

/** 节点注册表（id ↔ Node——命令执行定位）——模块级可变（mount/patch 支持
 *  per-call 注入（测试隔离）——同步段切换安全（并发交错在 await 点） */
let registry = new NodeRegistry()
export { registry }

// ══════════════════════════════════════════════════════════════════════
// 命令（P0——diff 决策的产物——DOM = fold(命令)）
// ══════════════════════════════════════════════════════════════════════

/** 命令（引擎内部——vn 是内部引用（props/ref 读取——序列化剥离）；
 *  parent 是父节点 id（字符串——apply 时 registry 解析——新节点 gen 阶段未创建）；
 *  ref 是锚（旧 DOM 节点 Node 或新节点 id）；causeId 是决策链（apply 事件携带） */
export type Command =
  | { op: 'create'; id: string; tag: string; vn: VNode }
  | { op: 'createText'; id: string; value: string }
  | { op: 'createHole'; id: string }
  | { op: 'insert'; id: string; parent: string; ref: Node | string | null; vn?: VNode | null; causeId?: string | null }
  | { op: 'setProp'; id: string; key: string; value: unknown; prev: unknown; vn?: VNode | null }
  | { op: 'setText'; id: string; value: string; vn?: VNode | null }
  | { op: 'bind'; id: string; event: string; handler: EventListener; parent: string | null }
  | { op: 'callRef'; id: string; kind: 'mount' | 'cleanup'; fn: (el: any) => void }
  | { op: 'remove'; id: string; vn?: VNode | null; causeId?: string | null }
  | { op: 'removeRange'; first: Node; last: Node; vn?: VNode | null; causeId?: string | null }
  | { op: 'removePortal'; portalKey: string; vn?: VNode | null; causeId?: string | null }
  | { op: 'unmountComp'; compId: string; type: unknown }
  | { op: 'move'; id: string; parent: Element; ref: string | null; key?: string | null; causeId?: string | null }
  | { op: 'portalOpenCheck'; portalKey: string; wasEmpty: boolean }

/** gen 输出：命令 + 回填计划（组件/Fragment 输出范围的 el/_outFirst/_outLast——
 *  apply 完成后按 id 查 registry 回填——gen 阶段不接触 DOM） */
export interface GenOut {
  cmds: Command[]
  binds: Array<{ vn: VNode; firstId: string | null; lastId: string | null; portalKey?: string }>
}

// ══════════════════════════════════════════════════════════════════════
// apply（执行器——写 DOM + DOM 层事件发射——唯一副作用点）
// ══════════════════════════════════════════════════════════════════════

/** 执行命令序列（同步——命令顺序 = 原操作顺序——事件流 = fold(命令)） */
export function applyCommands(cmds: Command[], binds: GenOut['binds'] = []): void {
  for (const c of cmds) {
    switch (c.op) {
      case 'create': {
        const el = SVG_TAGS.has(c.tag)
          ? document.createElementNS('http://www.w3.org/2000/svg', c.tag)
          : document.createElement(c.tag)
        el.setAttribute('data-v3-id', c.id)
        registry.register(c.id, el)
        c.vn.el = el
        stream.emit(ev('node', 'create', c.id, { tag: c.tag }))
        break
      }
      case 'createText': {
        const t = document.createTextNode(c.value)
        registry.register(c.id, t)
        stream.emit(ev('text', 'create', c.id, { value: c.value }))
        break
      }
      case 'createHole': {
        const hole = document.createComment('wf-hole')
        registry.register(c.id, hole)
        stream.emit(ev('node', 'create', c.id, { kind: 'hole' }))
        break
      }
      case 'insert': {
        const node = registry.get(c.id)
        if (!node) break
        const parentNode = resolveParent(c.parent)
        if (!parentNode) break
        const refNode = typeof c.ref === 'string' ? registry.get(c.ref) : c.ref
        if (refNode && refNode.parentNode === parentNode) parentNode.insertBefore(node, refNode)
        else parentNode.appendChild(node)
        stream.emit(ev('node', 'insert', c.id, { parent: parentId(parentNode), ref: refNode ? nodeId(refNode) : null, causeId: c.causeId ?? undefined }))
        // 插入后补注册（svg/深层元素——父未挂载时挂载点监听缺失——真实 hover 事故）
        ensureDelegationFor(node as Element, (c.vn as VNode)?.props ?? {})
        // ref 回调（挂载——稳定 ref 定义在 mount 层——§5.1 纪律）——ref:mount 事件
        const refFn = (c.vn as VNode)?.props?.ref
        if (typeof refFn === 'function') {
          stream.emit(ev('ref', 'mount', c.id, {}))
          try { refFn(node) } catch { /* ref 失败隔离 */ }
        }
        break
      }
      case 'setProp': {
        const el = registry.get(c.id)
        if (el?.nodeType !== 1) break
        applyProp(el as Element, c.key, c.value)
        stream.emit(ev('prop', 'update', c.id, { key: c.key, value: c.value, prev: c.prev ?? '' }))
        break
      }
      case 'setText': {
        const t = registry.get(c.id)
        if (t?.nodeType !== 3) break
        stream.emit(ev('text', 'update', c.id, { value: c.value, prev: t.nodeValue ?? '' }))
        t.nodeValue = c.value
        break
      }
      case 'bind': {
        const parentNode = c.parent ? resolveParent(c.parent) : null
        bindDelegated(c.id, c.event, c.handler, parentNode)
        break
      }
      case 'callRef': {
        stream.emit(ev('ref', c.kind === 'mount' ? 'mount' : 'cleanup', c.id, {}))
        try { c.fn(registry.get(c.id) ?? null) } catch { /* ref 失败隔离 */ }
        break
      }
      case 'remove': {
        const node = registry.get(c.id)
        if (!node) break
        removeNodeWithLifecycle(node, node.parentNode ?? document.body, c.vn, c.causeId)
        break
      }
      case 'removeRange': {
        removeOutputRangeExec(c, c.causeId)
        break
      }
      case 'removePortal': {
        removePortalContentExec(c.portalKey, c.vn, c.causeId)
        break
      }
      case 'unmountComp': {
        runUnmountHooks(c.compId)
        stream.emit(ev('comp', 'unmount', c.compId, { name: compName(c.type) }))
        unindexComponent(c.compId)
        break
      }
      case 'move': {
        const elNode = registry.get(c.id)
        if (!elNode || elNode.parentNode !== c.parent) break
        // ref = 新序列前一项的 id——target 推导移到 apply（此时 DOM 已按前序命令更新——
        // gen 阶段 DOM 未移动——nextSibling 是旧位置——延迟执行会错位）
        const prevEl = c.ref ? registry.get(c.ref) : null
        const target: Node | null = prevEl ? prevEl.nextSibling : c.parent.firstChild
        if (target !== elNode) {
          const prev = elNode.previousSibling ? registry.idOf(elNode.previousSibling) : null
          c.parent.insertBefore(elNode, target)
          stream.emit(ev('node', 'move', c.id, { parent: nodeId(c.parent), ref: target ? registry.idOf(target) : null, prev, key: c.key ?? null, causeId: c.causeId ?? undefined }))
        }
        break
      }
      case 'portalOpenCheck': {
        const container = ensurePortalContainer(c.portalKey)
        if (c.wasEmpty && container.childNodes.length > 0) {
          stream.emit(ev('portal', 'open', undefined, { portalKey: c.portalKey }))
        }
        break
      }
    }
  }
  // 回填计划（组件/Fragment 输出范围——apply 完成后统一回填）
  for (const b of binds) {
    if (b.portalKey != null) {
      b.vn.el = ensurePortalContainer(b.portalKey)
      b.vn._outFirst = null
      b.vn._outLast = null
      continue
    }
    const first = b.firstId ? registry.get(b.firstId) : null
    const last = b.lastId ? registry.get(b.lastId) : null
    b.vn.el = first
    b.vn._outFirst = first
    b.vn._outLast = last
  }
}

/** parent id 解析（'root'/'portal:key'/普通 id——registry 查） */
function resolveParent(id: string): Node | null {
  return registry.get(id)
}

/** 属性应用（create/setProp 共用——renderVNode/patchProps 的 set 逻辑收敛单点） */
function applyProp(el: Element, key: string, value: unknown): void {
  if (value == null || value === false) {
    if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      ;(el as HTMLInputElement | HTMLTextAreaElement).value = ''
      if (el instanceof HTMLInputElement && el.type === 'range') el.removeAttribute('value')
    }
    else el.removeAttribute(key)
    return
  }
  if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    if (el instanceof HTMLInputElement) setInputValue(el as HTMLInputElement, String(value))
    else (el as HTMLTextAreaElement).value = String(value)
  }
  else if (key === 'innerHTML') {
    el.innerHTML = String(value)
  }
  else if (key === 'style' && typeof value === 'object' && !Array.isArray(value)) {
    el.setAttribute('style', styleToCss(value as Record<string, unknown>))
  }
  else el.setAttribute(key, String(value))
}

/** style 对象 → cssText（camelCase → kebab-case——事件流消费端共用：SSR + replay） */
export function styleToCss(val: Record<string, unknown>): string {
  return Object.entries(val)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`).join(';')
}

/** 统一节点移除（node:remove 事件 + unregister——占位/文本的直接移除也要事件流——
 *  不变量"无事件流不渲染"——DOM 变化必须有事件） */
function removeDomNode(n: Node, parent: Node, causeId?: string | null): void {
  const id = registry.idOf(n)
  if (id && id !== 'el' && id !== 'node') {
    stream.emit(ev('node', 'remove', id, { parent: parentId(parent), causeId: causeId ?? undefined }))
    registry.unregister(id, n)
  }
  n.parentNode?.removeChild(n)
}

/** 节点移除的完整清理（REMOVE 事件 + EVENT_UNBIND（绑定生命周期）+ ref(null) + registry） */
export function removeNodeWithLifecycle(node: Node, parent: Node, vnodeRef?: VNode | null, causeId?: string | null): void {
  // 事件代理解绑（注册表删除 + EVENT_UNBIND——每事件可观测）
  const beforeUnbind = (globalThis as { __WF_V3_AUDIT?: string }).__WF_V3_AUDIT !== '0' ? listenerCount(registry.idOf(node)) : 0
  unbindAll(registry.idOf(node))
  // round3 阶段 4：监听器泄漏检测（dev）——移除前有绑定但 unbindAll 后仍有残留
  if (beforeUnbind > 0) {
    const after = listenerCount(registry.idOf(node))
    if (after > 0) {
      console.warn(`[vdom3/audit] 节点监听残留：${after}/${beforeUnbind} 个监听未清理（${String((vnodeRef as any)?.type ?? node.nodeName).slice(0, 20)}）——事件仍会响应——泄漏`)
    }
  }
  if (vnodeRef) callRefCleanup(vnodeRef)
  const rid = registry.idOf(node)
  stream.emit(ev('node', 'remove', rid, { parent: parentId(parent), causeId: causeId ?? undefined }))
  node.parentNode?.removeChild(node)
  registry.unregister(rid, node)
}

/** 递归调 ref(null)（移除树——ref 纪律：卸载清理（lockScroll/focus）依赖
 *  ——portal/组件输出等嵌套结构的 ref 全部清理——REF_CLEANUP 事件（生命周期可观测））
 *  导出（组件级 update 用） */
export function callRefCleanup(v: VNode | null | undefined): void {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return
  const refFn = (v as VNode).props?.ref
  if (typeof refFn === 'function') {
    const el = (v as VNode).el
    stream.emit(ev('ref', 'cleanup', el ? registry.idOf(el) : 'null'))
    try { refFn(null) } catch { /* ref 失败隔离 */ }
  }
  for (const c of childrenOf(v as VNode)) {
    if (c != null && typeof c === 'object' && !Array.isArray(c)) callRefCleanup(c as VNode)
  }
}

/** 嵌套 portal 清理：外层 portal 内容移除时，内容 vnode 树里的嵌套 portal
 * （DOM 挂各自独立容器）必须一并清空——否则幽灵面板残留
 * （真实事故：NavMenu 嵌套子菜单——顶层子菜单关闭后 API 嵌套面板仍挂在
 *  #__wf_portal——vnode 已移除但 DOM 不清理） */
function removeNestedPortals(v: VNodeChild | null | undefined): void {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return
  const node = v as VNode
  if (isPortalNode(node)) {
    for (const c of childrenOf(node)) removeNestedPortals(c)
    removePortalContentExec(String(node.props?.portalKey ?? 'default'), node, null)
    return
  }
  for (const c of childrenOf(node)) removeNestedPortals(c)
}

/** removePortal 命令执行：远程容器清空（子树 REMOVE 事件 + ref(null)——ref 纪律：
 *  卸载必须调 ref(null)（usePopup 的 portalPanelRef 清理——lockScroll/focus 恢复）） */
export function removePortalContentExec(portalKey: string, pv: VNode | null | undefined, causeId?: string | null): void {
  if (pv) for (const c of childrenOf(pv)) removeNestedPortals(c)
  const container = ensurePortalContainer(portalKey)
  if (pv) callRefCleanup(pv)
  for (const child of [...container.childNodes]) {
    unbindAll(registry.idOf(child))
    const cid = registry.idOf(child)
    stream.emit(ev('node', 'remove', cid, { parent: NodeRegistry.PORTAL(portalKey), causeId: causeId ?? undefined }))
    container.removeChild(child)
    registry.unregister(cid, child)
  }
  if (container.childNodes.length === 0) {
    stream.emit(ev('portal', 'close', undefined, { portalKey }))
  }
}

/** 兼容导出（vdom2/vdom3 调用方签名——PortalVNode → portalKey+vn） */
export function removePortalContent(pv: PortalVNode): void {
  removePortalContentExec(String(pv.props?.portalKey ?? 'default'), pv, null)
}

/** removeRange 命令执行：多节点输出范围移除（首节点生命周期清理 + 范围其余直接移除） */
function removeOutputRangeExec(c: Extract<Command, { op: 'removeRange' }>, causeId?: string | null): void {
  const { first, last, vn } = c
  const el = first.parentNode as Element
  if (typeof (vn as VNode)?.type === 'function' && (vn as VNode)._id) {
    // 首节点生命周期清理（组件卸载钩子/ref(null)）
    const compId = (vn as VNode)._id as string
    runUnmountHooks(compId)
    stream.emit(ev('comp', 'unmount', compId, { name: compName((vn as VNode).type) }))
    unindexComponent(compId)
    removeNodeWithLifecycle(first, el, vn, causeId)
  } else if ((vn as VNode)?.el && (vn as VNode).el!.parentNode === el) {
    removeNodeWithLifecycle((vn as VNode).el!, el, vn, causeId)
  } else if (first.parentNode === el) {
    removeDomNode(first, el, causeId)
  }
  // 范围其余节点（first 后到 last——含 last——统一移除）
  let n = first.nextSibling
  const guard = 64 // 防御：范围异常（循环引用等）截断
  let g = 0
  while (n && n !== last && g++ < guard) {
    const next = n.nextSibling
    removeDomNode(n, el, causeId)
    n = next
  }
  if (last.parentNode === el) removeDomNode(last, el, causeId)
}

// ══════════════════════════════════════════════════════════════════════
// diff（决策——gen 系列——不写 DOM——生成命令）
// ══════════════════════════════════════════════════════════════════════

/** 挂载：纯树 → 命令 → DOM（reg 可选——per-call 隔离；默认全局）
 *  挂载前清空容器语义保持（SSR 旧内容同帧移除——见下） */
export function mount(vnode: VNode, root: HTMLElement, reg?: NodeRegistry): void {
  const prev = registry
  if (reg) registry = reg
  try {
    ensureDelegationRoot(root)
    // ★ 同帧追加 + 移除旧内容（SSR 首帧无白屏）——apply 后同步移除（保持语义）
    registry.register(NodeRegistry.ROOT, root)
    const ssrOld = [...root.childNodes]
    const cmds: Command[] = []
    const binds: GenOut['binds'] = []
    genRender(vnode, NodeRegistry.ROOT, null, cmds, binds)
    applyCommands(cmds, binds)
    for (const n of ssrOld) if (n.parentNode === root) root.removeChild(n)
  } finally {
    registry = prev
  }
}

/** 渲染 vnode（gen——同步——树已构建——生成命令 + 回填计划）
 *  parentId：父节点 id（'root'/'portal:key'/native id——apply 时解析）
 *  返回：该子树在命令序列中的 DOM 范围（firstId/lastId——空输出 null） */
function genRender(vn0: VNode, parentId: string, anchor: Node | string | null, cmds: Command[], binds: GenOut['binds']): { firstId: string; lastId: string } | null {
  const vnode = vn0 as VNode
  // 组件/app 节点：输出 _child（已构建——直接渲染输出；el 定位组件输出首节点）
  if (typeof vnode.type === 'function' || vnode.type === App) {
    const output = vnode._child !== undefined ? vnode._child : childrenOf(vnode)[0] ?? null
    if (output == null) { binds.push({ vn: vnode, firstId: null, lastId: null }); return null }
    // 已渲染（isConnected（真实 DOM/portal 容器）或 el 在父内（测试容器未连接））→ 复用
    if (vnode.el != null && (vnode.el.isConnected || vnode.el.parentNode === resolveParent(parentId))) return null
    const r = genRender(output as VNode, parentId, anchor, cmds, binds)
    binds.push({ vn: vnode, firstId: r?.firstId ?? null, lastId: r?.lastId ?? null })
    return r
  }
  if (isFragmentNode(vnode)) {
    let first: string | null = null
    let last: string | null = null
    for (const c of childrenOf(vnode)) {
      const r = genRenderChild(c, parentId, anchor, cmds, binds)
      if (r) { if (!first) first = r.firstId; last = r.lastId }
    }
    binds.push({ vn: vnode, firstId: first, lastId: last })
    return first ? { firstId: first, lastId: last! } : null
  }
  if (isPortalNode(vnode)) {
    const pv = vnode as PortalVNode
    const portalKey = String(pv.props?.portalKey ?? 'default')
    // 容器 id 注册（事件流 parent 用 portal:key——idOf 经 WeakMap 解析）
    const container = ensurePortalContainer(portalKey)
    registry.register(NodeRegistry.PORTAL(portalKey), container)
    ensureDelegationRoot(container)
    let first: string | null = null
    let last: string | null = null
    const wasEmpty = container.childNodes.length === 0
    for (const c of childrenOf(pv)) {
      const r = genRenderChild(c, NodeRegistry.PORTAL(portalKey), null, cmds, binds)
      if (r) { if (!first) first = r.firstId; last = r.lastId }
    }
    // round3 阶段 3：portal 生命周期透明——空容器 → 有内容 = 弹层打开
    cmds.push({ op: 'portalOpenCheck', portalKey, wasEmpty })
    binds.push({ vn: pv, firstId: null, lastId: null, portalKey })
    return first ? { firstId: first, lastId: last! } : null
  }
  const id = nextNodeId()
  cmds.push({ op: 'create', id, tag: vnode.type as string, vn: vnode })
  for (const [key, val] of Object.entries(vnode.props ?? {})) {
    if (key === 'key' || key === 'children' || key === 'ref') continue
    if (typeof val === 'function' && /^on[A-Z]/.test(key)) {
      cmds.push({ op: 'bind', id, event: key.slice(2).toLowerCase(), handler: val as EventListener, parent: parentId })
      continue
    }
    if (val != null && val !== false) {
      cmds.push({ op: 'setProp', id, key, value: val, prev: '' })
    }
  }
  cmds.push({ op: 'insert', id, parent: parentId, ref: anchor, vn: vnode, causeId: currentCause })
  for (const c of childrenOf(vnode)) {
    genRenderChild(c, id, null, cmds, binds) // 子节点 parent = 本元素 id
  }
  // native 单节点——范围 = 自身（原 renderVNode：_outFirst = _outLast = el——
  // 不得推进到子节点——否则组件/Fragment 的 _outLast 回填到文本——移除范围错位）
  return { firstId: id, lastId: id }
}

/** 渲染子节点（gen——文本/空洞/native/组件/portal——parentId 引用） */
function genRenderChild(c: FlatChild, parentId: string, anchor: Node | string | null, cmds: Command[], binds: GenOut['binds']): { firstId: string; lastId: string } | null {
  if (c == null || c === false || c === true) {
    const id = nextNodeId()
    cmds.push({ op: 'createHole', id })
    cmds.push({ op: 'insert', id, parent: parentId, ref: anchor })
    return { firstId: id, lastId: id }
  }
  if (typeof c === 'string' || typeof c === 'number') {
    const id = nextNodeId()
    cmds.push({ op: 'createText', id, value: String(c) })
    cmds.push({ op: 'insert', id, parent: parentId, ref: anchor })
    return { firstId: id, lastId: id }
  }
  return genRender(c, parentId, anchor, cmds, binds)
}

/**
 * patch：旧树（纯）vs 新树（纯）→ 命令 → apply。
 * 同位置同类型（含 key）复用——仅变化发命令；异类型 → REMOVE+CREATE+INSERT（重建）。
 */
export function patch(oldV: VNode | null, newV: VNode | string | number | null | undefined | boolean, parent: Node, anchor?: Node | null, reg?: NodeRegistry): Node | null {
  const prev = registry
  if (reg) registry = reg
  try {
    // 结构共享快路径：同引用（build 复用旧树节点）→ 零 diff 零命令（静态分支）
    if (oldV !== null && newV !== null && typeof oldV === 'object' && typeof newV === 'object' && oldV === newV) {
      return (oldV as VNode).el ?? null
    }
    const cmds: Command[] = []
    const binds: GenOut['binds'] = []
    genPatchInner(oldV, newV, parentId(parent), anchor ?? null, cmds, binds)
    applyCommands(cmds, binds)
    return typeof newV === 'object' && newV != null && !Array.isArray(newV)
      ? ((newV as VNode).el ?? null)
      : null
  } finally {
    registry = prev
  }
}

// ── 阶段 3：事件因果链（causeId——重建/移除决策与 DOM 操作的显式关联） ──
let causeUid = 0
let currentCause: string | null = null
const causeStack: (string | null)[] = []
/** 决策点进入（分配 causeId——压栈） */
function beginCause(): string {
  causeStack.push(currentCause)
  currentCause = `c${++causeUid}`
  return currentCause
}
/** 决策点退出（恢复外层 cause） */
function endCause(): void {
  currentCause = causeStack.pop() ?? null
}

/** 单节点 kind 分类（diff:transition 决策事件的 from/to——阶段 0——vdom2 VKind 语义） */
function vKindOf(v: VNodeChild | null): string {
  if (v == null || typeof v === 'boolean') return 'hole'
  if (typeof v === 'string' || typeof v === 'number') return 'text'
  if (typeof v === 'object' && !Array.isArray(v)) {
    const t = (v as VNode).type
    if (typeof t === 'function') return 'comp'
    if (t === Fragment) return 'frag'
    if (t === Portal) return 'portal'
    return 'native'
  }
  return 'unknown'
}

function genPatchInner(oldV: VNode | null, newV: VNodeChild, parentIdStr: string, anchor: Node | null, cmds: Command[], binds: GenOut['binds']): void {
  // 决策事件（阶段 0.2——diff 转换决策可观测——from 旧 kind → to 新 kind）
  const fromKind = vKindOf(oldV)
  const toKind = vKindOf(newV)
  stream.emit(ev('diff', 'transition', undefined, { from: fromKind, to: toKind, level: 'trace' }))
  // 文本
  if (typeof newV === 'string' || typeof newV === 'number') {
    const str = String(newV)
    const existing = oldV && typeof oldV === 'object' ? oldV.el : (resolveParent(parentIdStr)?.childNodes[0] ?? null)
    if (existing && existing.nodeType === 3) {
      if (existing.nodeValue !== str) {
        cmds.push({ op: 'setText', id: nodeId(existing), value: str })
      }
      return
    }
    const id = nextNodeId()
    cmds.push({ op: 'createText', id, value: str })
    cmds.push({ op: 'insert', id, parent: parentIdStr, ref: anchor })
    return
  }
  if (newV == null || newV === false || newV === true) {
    if (oldV != null && typeof oldV === 'object' && !Array.isArray(oldV)) {
      // 输出变 null（条件移除）——统一生命周期清理（Portal 输出的 el 为 null——内容独立挂载）
      if (isPortalNode(oldV)) {
        cmds.push({ op: 'removePortal', portalKey: String((oldV as PortalVNode).props?.portalKey ?? 'default'), vn: oldV as VNode })
      } else if (oldV.el && oldV.el.parentNode === resolveParent(parentIdStr)) {
        cmds.push({ op: 'remove', id: nodeId(oldV.el), vn: oldV as VNode })
      }
    }
    return
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
      emitPatch(oldIsVNode ? classifyKind(oldV) : null, kind, 'unhandled')
      console.warn(`[vdom3/patch] kind=${kind} 无同类型处理器——降级重建（kind 分发完整性缺失）`)
      genRender(vn, parentIdStr, anchor, cmds, binds)
      return
    }
    patcher(ov, vn, parentIdStr, anchor, cmds, binds)
    return
  }

  // 异类型：rebuild（PATCH 决策事件——异类型走通用重建）
  emitPatch(oldIsVNode ? classifyKind(oldV) : null, classifyKind(vn), 'rebuild')
  if (oldIsVNode) {
    const oldEl = (oldV as VNode).el
    if (oldEl && oldEl.parentNode === resolveParent(parentIdStr)) {
      // 重建锚点先捕获（移除前）：anchor 可能 === oldEl（unkeyed 列表位置重建——
      // 同 type 异 key 走此路径）——移除后 anchor 脱离 → insert 落 appendChild 末尾
      const rebuildAnchor = oldEl.nextSibling ?? anchor
      // 旧组件 → unmountComp 命令；移除旧 + 渲染新（命令顺序：清理先、创建后）
      if (typeof (oldV as VNode).type === 'function' && (oldV as VNode)._id) {
        cmds.push({ op: 'unmountComp', compId: (oldV as VNode)._id!, type: (oldV as VNode).type })
      }
      cmds.push({ op: 'remove', id: nodeId(oldEl), vn: oldV as VNode })
      genRender(vn, parentIdStr, rebuildAnchor, cmds, binds)
      return
    } else if (isPortalNode(oldV)) {
      // 旧 portal：清空远程容器
      cmds.push({ op: 'removePortal', portalKey: String((oldV as PortalVNode).props?.portalKey ?? 'default'), vn: oldV as VNode })
    }
  }
  genRender(vn, parentIdStr, anchor, cmds, binds)
}

/** 属性 diff（同类型复用——仅变化发命令） */
function genPatchProps(el: Element, oldProps: Record<string, unknown>, newProps: Record<string, unknown>, cmds: Command[]): void {
  const target = nodeId(el)
  const allKeys = new Set([...Object.keys(oldProps ?? {}), ...Object.keys(newProps ?? {})])
  // ref 切换（引用变化 → 旧(null) + 新(el)——稳定 ref 不重绑）
  const oldRef = oldProps?.ref
  const newRef = newProps?.ref
  if (oldRef !== newRef) {
    if (typeof oldRef === 'function') cmds.push({ op: 'callRef', id: target, kind: 'cleanup', fn: oldRef as (el: any) => void })
    if (typeof newRef === 'function') cmds.push({ op: 'callRef', id: target, kind: 'mount', fn: newRef as (el: any) => void })
  }
  for (const key of allKeys) {
    if (key === 'key' || key === 'children' || key === 'ref') continue
    const ov = oldProps?.[key]
    const nv = newProps?.[key]
    if (ov === nv) continue
    // 对象属性浅比较（style 等——每次渲染新对象——值相同不重设——零变化零命令）
    if (ov != null && nv != null && typeof ov === 'object' && typeof nv === 'object'
        && !Array.isArray(ov) && !Array.isArray(nv)
        && shallowEqual(ov as Record<string, unknown>, nv as Record<string, unknown>)) continue
    if (typeof nv === 'function' && /^on[A-Z]/.test(key)) {
      // 事件代理：handler 更新 = Map 覆盖（零重绑零事件）
      cmds.push({ op: 'bind', id: target, event: key.slice(2).toLowerCase(), handler: nv as EventListener, parent: null })
      continue
    }
    cmds.push({ op: 'setProp', id: target, key, value: nv, prev: ov ?? '' })
  }
}

/** PATCH 决策事件（全链路事件流——kind 分发可观测/可断言） */
function emitPatch(oldKind: VKind | null, newKind: VKind, action: 'reuse' | 'rebuild' | 'move' | 'remove' | 'unhandled'): void {
  stream.emit(ev('vnode', 'patch', undefined, { oldKind, newKind, strategy: action }))
}

// ── kind 同类型处理器表（kind → 复用路径——显式注册——缺注册明确失败） ──

/** native：属性 diff + children patch（el 守卫——ov.el 缺失 → 明确失败 + 降级） */
function genPatchNativeKind(ov: VNode, vn: VNode, parentIdStr: string, anchor: Node | null, cmds: Command[], binds: GenOut['binds']): void {
  const el = ov.el as Element | undefined
  if (el == null) {
    emitPatch(classifyKind(ov), 'native', 'unhandled')
    console.warn(`[vdom3/patch] native 复用但 ov.el 缺失（tag=${String(ov.type)}——kind 分发或渲染时序错误）——降级重建`)
    genRender(vn, parentIdStr, anchor, cmds, binds)
    return
  }
  vn.el = el
  genPatchProps(el, ov.props, vn.props, cmds)
  genPatchChildren(ov, vn, el, cmds, binds)
}

/** 组件：复用实例（_render 保持）——输出已由 build 更新——patch 子树 */
function genPatchCompKind(ov: VNode, vn: VNode, parentIdStr: string, anchor: Node | null, cmds: Command[], binds: GenOut['binds']): void {
  vn._render = ov._render
  vn._id = ov._id
  // app 节点：输出 = _child（子应用根构建）——同组件路径
  const out = vn._child !== undefined ? vn._child : childrenOf(vn)[0] ?? null
  const oldOut = ov._child !== undefined ? ov._child : childrenOf(ov)[0] ?? null
  if (out == null || out === false || out === true) {
    // 注意：组件输出 null ≠ 组件从树中移除——实例保留（下次渲染输出恢复）——
    // 索引不注销（updateComponent 仍可 O(1) 定位）
    if (oldOut && isPortalNode(oldOut)) {
      cmds.push({ op: 'removePortal', portalKey: String((oldOut as PortalVNode).props?.portalKey ?? 'default'), vn: oldOut as VNode })
    } else if (ov.el) {
      // 递归 ref(null)——ref 纪律：lockScroll/focus 清理依赖
      // 多节点范围移除（阶段 2——组件输出 Fragment 多节点——只移首节点会残留 m2）
      const first = ov._outFirst ?? ov.el
      const last = ov._outLast ?? ov.el
      if (last !== first && first.parentNode === resolveParent(parentIdStr)) {
        cmds.push({ op: 'removeRange', first, last, vn: ov })
      } else {
        cmds.push({ op: 'remove', id: nodeId(ov.el), vn: ov })
      }
      ov.el = null
    }
    vn.el = null
    return
  }
  if (ov.el == null || !(ov.el.isConnected || ov.el.parentNode === resolveParent(parentIdStr))) {
    // 输出重新渲染（此前为 null/脱离）——genRender（binds 回填 el）
    genRender(vn, parentIdStr, anchor, cmds, binds)
    return
  }
  // 组件输出变化 → patch 子树（组件 el 保持——输出首节点定位）
  genPatchInner(oldOut as VNode | null, out as VNode, parentIdStr, anchor, cmds, binds)
  vn.el = ov.el
  // 多节点输出范围同步（阶段 2 精化——patch 路径——widthOf 推进依赖——
  // 组件输出 Fragment 时范围跟随输出——裁剪项：多节点相邻边界）
  vn._outFirst = (out as VNode)._outFirst ?? vn.el
  vn._outLast = (out as VNode)._outLast ?? vn.el
}

/** Fragment：children 级 patch（Fragment 无自身 el——children 的 DOM 展开在父容器——
 *  baseIndex 对齐 Fragment 的起始位置（前后可有兄弟）） */
function genPatchFragKind(ov: VNode, vn: VNode, parentIdStr: string, _anchor: Node | null, cmds: Command[], binds: GenOut['binds']): void {
  genPatchChildren(ov, vn, resolveParent(parentIdStr) as Element, cmds, binds, fragmentBaseIndex(ov))
  // Fragment 的 el = 首 child 的 el（组件输出定位）
  const firstChild = childrenOf(ov).find((c): c is VNode => c != null && typeof c === 'object' && !Array.isArray(c))
  vn.el = ov.el ?? (firstChild?.el ?? null)
  // 多节点输出范围同步（阶段 2 精化——children 首尾——widthOf 推进依赖）
  const kids = childrenOf(vn).filter((c): c is VNode => c != null && typeof c === 'object' && !Array.isArray(c))
  const firstKid = kids[0]
  const lastKid = kids[kids.length - 1]
  vn._outFirst = firstKid?.el ?? vn.el
  vn._outLast = lastKid?._outLast ?? lastKid?.el ?? vn.el
}

/** portal：内容 patch 到远程容器（同 key 复用） */
function genPatchPortalKind(ov: VNode, vn: VNode, _parentIdStr: string, _anchor: Node | null, cmds: Command[], binds: GenOut['binds']): void {
  const portalKey = String(vn.props?.portalKey ?? 'default')
  const container = ensurePortalContainer(portalKey)
  registry.register(NodeRegistry.PORTAL(portalKey), container)
  genPatchChildren(ov, vn, container, cmds, binds)
  vn.el = container
}

/** kind 同类型处理器表（显式注册——text/null 在 genPatchInner 入口已处理——此处占位） */
const KIND_PATCHERS: Partial<Record<VKind, (ov: VNode, vn: VNode, parentIdStr: string, anchor: Node | null, cmds: Command[], binds: GenOut['binds']) => void>> = {
  native: genPatchNativeKind,
  comp: genPatchCompKind,
  app: genPatchCompKind, // app 节点同组件路径（输出 _child——子应用根）
  frag: genPatchFragKind,
  portal: genPatchPortalKind,
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

/** keyed 移动（重排优化）：新 key 在旧列表存在 → 按新顺序移动（命令携带新序列
 *  前一项的 id——apply 时推导 target（DOM 已更新）——与即时操作的语义一致） */
function genMoveKeyedNodes(oldKids: VNodeChild[], newKids: VNodeChild[], el: Element, cmds: Command[]): void {
  const oldKeyIdx = new Map<string, number>()
  oldKids.forEach((k, i) => {
    if (isVNode(k) && k.key != null) oldKeyIdx.set(k.key, i)
  })
  let prevId: string | null = null // 新序列中前一个已处理项的 id（期望位置锚）
  for (let i = 0; i < newKids.length; i++) {
    const nc = newKids[i]
    if (!isVNode(nc) || nc.key == null) { prevId = null; continue }
    const oi = oldKeyIdx.get(nc.key)
    let elNode: Node | null = null
    if (oi != null && isVNode(oldKids[oi])) elNode = (oldKids[oi] as VNode).el ?? null
    if (elNode && elNode.parentNode === el) {
      cmds.push({ op: 'move', id: nodeId(elNode), parent: el, ref: prevId, key: nc.key, causeId: currentCause })
      prevId = nodeId(elNode)
    }
  }
}

/** 全 keyed 列表 diff：DOM 移动（MOVE 命令）+ 按 key 配对 patch + 新增/移除 */
function genPatchKeyedChildren(oldKids: VNodeChild[], newKids: VNodeChild[], el: Element, cmds: Command[], binds: GenOut['binds']): void {
  const oldMap = new Map<string, VNode>()
  for (const k of oldKids) if (isVNode(k) && k.key != null) oldMap.set(k.key, k)
  // 新顺序移动 DOM（MOVE 命令——重排不重建）
  genMoveKeyedNodes(oldKids, newKids, el, cmds)
  // 按新顺序 patch（同 key 复用；新 key 创建——插到 prev 之后；DOM 锚 = prev 后）
  let prev: Node | string | null = null
  for (const nc of newKids) {
    const nv = nc as VNode
    const oc = oldMap.get(nv.key ?? '') ?? null
    if (oc && oc !== nv) {
      genPatch(oc, nv, el, null, cmds, binds)
      prev = nv.el ?? prev
    } else if (!oc) {
      const out = genRender(nv, nodeId(el), prev ? (typeof prev === 'string' ? prev : prev.nextSibling) : el.firstChild, cmds, binds)
      prev = out?.firstId ?? prev
    } else {
      // 同引用复用（结构共享快路径——build 复用旧树节点）：DOM 已在位、零 diff——
      // prev 必须推进（真实事故：4→5 末尾追加 T2 插到 firstChild——prev 恒 null）
      prev = nv.el ?? oc.el ?? prev
    }
  }
  // 移除无新 key 的旧项
  const newKeys = new Set(newKids.filter((k) => isVNode(k)).map((k) => (k as VNode).key))
  for (const ok of oldKids) {
    if (isVNode(ok) && ok.key != null && !newKeys.has(ok.key) && ok.el?.parentNode === el) {
      if (typeof ok.type === 'function' && ok._id) {
        cmds.push({ op: 'unmountComp', compId: ok._id, type: ok.type })
      }
      cmds.push({ op: 'remove', id: nodeId(ok.el), vn: ok })
    }
  }
}

/** children diff（el 父容器；baseIndex = 起始 childNodes 偏移——Fragment 的 children
 *  展开在父容器非 0 位——索引对齐） */
// 动态数组 key 检测去重（vdom2 A 级检测——同数组签名只报一次——防表单静态字段误报刷屏）
const warnedDynamicArrays = new Set<string>()

function genPatchChildren(oldV: VNode, newV: VNode, el: Element, cmds: Command[], binds: GenOut['binds'], baseIndex = 0): void {
  const oldKids = childrenOf(oldV)
  const newKids = childrenOf(newV)
  // 决策事件（阶段 4——key 模式选择可观测——业务身份声明协议观测点）
  const keyMode = newKids.length > 1 && newKids.every((k) => isVNode(k) && k.key != null) ? 'keyed' : 'unkeyed'
  stream.emit(ev('diff', 'mode', undefined, { mode: keyMode, len: newKids.length, prevLen: oldKids.length, level: 'trace' }))
  // A 级动态检测（阶段 4）：长度变化 + 无 key 组件项 → dev error——portal 槽豁免
  if ((globalThis as { __WF_V3_AUDIT?: string }).__WF_V3_AUDIT !== '0' && oldKids.length !== newKids.length) {
    const bizOld = oldKids.filter((k) => !isPortalNode(k))
    const bizNew = newKids.filter((k) => !isPortalNode(k))
    if (bizOld.length !== bizNew.length) {
      const sig = `${bizNew.length}:${bizOld.length}`
      if (!warnedDynamicArrays.has(sig)) {
        warnedDynamicArrays.add(sig)
        for (let i = 0; i < newKids.length; i++) {
          const c = newKids[i]
          if (c != null && typeof c === 'object' && !Array.isArray(c) && typeof (c as VNode).type === 'function' && (c as VNode).key == null) {
            console.error(
              `[vdom3/audit] 动态数组位置 ${i} 的组件缺少 key（${compName((c as VNode).type)}）——列表增删/重排会错位组件实例状态。` +
              `请提供业务身份 key（如 key={item.id}）；无状态 native 项豁免。`,
            )
            break
          }
        }
      }
    }
  }
  // 全 keyed 列表（>1 项且全部有 key）→ keyed diff（重排 MOVE——DOM 状态保持）
  if (newKids.length > 1 && newKids.every((k) => isVNode(k) && k.key != null)) {
    genPatchKeyedChildren(oldKids, newKids, el, cmds, binds)
    return
  }

  // 占位法：children 含空洞（false/null/true 保留）——DOM 建占位注释节点——
  // |childNodes| 恒 = |children|——按索引对称处理（空洞 ↔ 真实对称互换——不塌缩）
  const isHoleNode = (n: Node | null): boolean => !!n && n.nodeType === 8 && (n.nodeValue ?? '').includes('wf-hole')
  const len = Math.max(oldKids.length, newKids.length)
  // domIdx：DOM 索引推进（多节点项（组件/Fragment 输出宽度 >1）——宽度推进）
  let domIdx = baseIndex
  /** 当前项 DOM 宽度（处理后的 nc 范围——多节点宽度；单节点/文本/空洞 = 1） */
  const widthOf = (v: VNodeChild | null, dNode: Node | null): number => {
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      const first = (v as VNode)._outFirst
      const last = (v as VNode)._outLast
      if (first && last && last !== first) {
        let w = 1
        let n: Node | null = first
        const guard = 64
        let g = 0
        while (n && n !== last && g++ < guard) { w++; n = n.nextSibling }
        return w
      }
    }
    return dNode ? 1 : 0
  }
  const parentIdStr = nodeId(el)
  for (let i = 0; i < len; i++) {
    const oc = i < oldKids.length ? oldKids[i] : null
    const nc = i < newKids.length ? newKids[i] : null
    // baseIndex 偏移（Fragment 的 children 展开在父容器——位置可能非 0）
    const domNode = el.childNodes[domIdx] ?? null // 占位法：槽位 i 的 DOM（占位或真实——恒存在）

    if (i >= newKids.length) {
      // 旧项多余（新树已尽）——统一移除（含占位）——推进旧项宽度（多节点）
      const w = oc != null && typeof oc === 'object' && (oc as VNode)._outFirst && (oc as VNode)._outLast && (oc as VNode)._outLast !== (oc as VNode)._outFirst ? widthOf(oc, domNode) : 1
      genRemoveOutputRange(oc, el, domNode, i, cmds)
      domIdx += w
      continue
    }
    if (typeof nc === 'string' || typeof nc === 'number') {
      const str = String(nc)
      if (domNode && domNode.nodeType === 3) {
        if (domNode.nodeValue !== str) {
          cmds.push({ op: 'setText', id: nodeId(domNode), value: str })
        }
      } else {
        // 占位/旧节点 → 文本（占位法对称替换——createText + insert(domNode 前) + remove）
        const id = nextNodeId()
        cmds.push({ op: 'createText', id, value: str })
        cmds.push({ op: 'insert', id, parent: parentIdStr, ref: domNode })
        if (domNode && domNode.parentNode === el) {
          cmds.push({ op: 'remove', id: nodeId(domNode) })
        }
      }
      domIdx += 1
      continue
    }
    if (nc == null || nc === false || nc === true) {
      // 旧项是 portal：远程容器内容必须清理（条件渲染关闭 portal → null 残留）
      if (oc != null && typeof oc === 'object' && !Array.isArray(oc) && isPortalNode(oc)) {
        cmds.push({ op: 'removePortal', portalKey: String((oc as PortalVNode).props?.portalKey ?? 'default'), vn: oc as VNode })
      }
      // 空洞：旧占位保留（无操作）；旧真实 → 占位替换（对称——不塌缩——锚先捕获）
      if (!isHoleNode(domNode)) {
        // 决策点（阶段 3——条件移除的因果链）
        beginCause()
        try {
          const anchor = domNode ? domNode.nextSibling : null
          genRemoveOutputRange(oc, el, domNode, i, cmds)
          const id = nextNodeId()
          cmds.push({ op: 'createHole', id })
          cmds.push({ op: 'insert', id, parent: parentIdStr, ref: anchor, causeId: currentCause })
        } finally { endCause() }
      }
      domIdx += 1
      continue
    }
    if (oc != null && typeof oc === 'object' && (oc as VNode).type === (nc as VNode).type) {
      // 同类型（位置语义）——patch 复用
      genPatch(oc as VNode, nc as VNode, el, domNode ?? null, cmds, binds)
    } else {
      // 异类型/空洞→真实：新节点插到 domNode 前（占位法对称——占位/旧节点替换）
      beginCause()
      try {
        const out = genRender(nc as VNode, parentIdStr, domNode ?? null, cmds, binds)
        if (domNode && !isHoleNode(domNode)) {
          genRemoveOutputRange(oc, el, domNode, i, cmds)
        } else if (domNode && isHoleNode(domNode)) {
          cmds.push({ op: 'remove', id: nodeId(domNode) })
        }
        if (out?.firstId == null && !domNode) {
          // 渲染失败且无旧节点——建占位兜底（保持同构）
          const id = nextNodeId()
          cmds.push({ op: 'createHole', id })
          cmds.push({ op: 'insert', id, parent: parentIdStr, ref: null })
        }
      } finally { endCause() }
    }
    // 推进 domIdx（多节点项宽度——组件/Fragment 输出范围）
    const w = widthOf(nc, domNode) ||
      (oc != null && typeof oc === 'object' && !Array.isArray(oc) && (oc as VNode)._outFirst && (oc as VNode)._outLast && (oc as VNode)._outLast !== (oc as VNode)._outFirst ? widthOf(oc as VNode, domNode) : 1)
    domIdx += w
  }
  auditOrder(el, newV)
}

/** 移除旧项输出范围（命令生成——多节点：removeRange；单节点/文本/占位：remove） */
function genRemoveOutputRange(oc: VNodeChild | null, el: Element, domNode: Node | null, _i: number, cmds: Command[]): void {
  if (oc != null && typeof oc === 'object' && (oc as VNode)._outFirst && (oc as VNode)._outLast && (oc as VNode)._outLast !== (oc as VNode)._outFirst) {
    cmds.push({ op: 'removeRange', first: (oc as VNode)._outFirst!, last: (oc as VNode)._outLast!, vn: oc as VNode, causeId: currentCause })
    return
  }
  if (oc != null && typeof oc === 'object' && isPortalNode(oc)) {
    cmds.push({ op: 'removePortal', portalKey: String((oc as PortalVNode).props?.portalKey ?? 'default'), vn: oc as VNode, causeId: currentCause })
    return
  }
  if (oc != null && typeof oc === 'object' && (oc as VNode)._child && isPortalNode((oc as VNode)._child)) {
    cmds.push({ op: 'removePortal', portalKey: String(((oc as VNode)._child as PortalVNode).props?.portalKey ?? 'default'), vn: (oc as VNode)._child as VNode, causeId: currentCause })
    return
  }
  if (oc != null && typeof oc === 'object' && typeof (oc as VNode).type === 'function' && (oc as VNode)._id) {
    cmds.push({ op: 'unmountComp', compId: (oc as VNode)._id!, type: (oc as VNode).type })
    if ((oc as VNode).el) {
      cmds.push({ op: 'remove', id: nodeId((oc as VNode).el!), vn: oc as VNode, causeId: currentCause })
    } else {
      const dn = domNode
      if (dn && dn.parentNode === el) {
        cmds.push({ op: 'remove', id: nodeId(dn), causeId: currentCause })
      }
    }
    return
  }
  if (oc != null && typeof oc === 'object' && (oc as VNode).el) {
    cmds.push({ op: 'remove', id: nodeId((oc as VNode).el!), vn: oc as VNode, causeId: currentCause })
  } else if (domNode) {
    cmds.push({ op: 'remove', id: nodeId(domNode), causeId: currentCause })
  }
}

/** 对象浅比较（key 级——style 等不嵌套——零变化零命令判定） */
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (a[k] !== b[k]) return false
  }
  return true
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

/** 统一 patch 入口（gen——组件/children 的复用路径调用） */
function genPatch(oldV: VNode, newV: VNode, parent: Node, anchor: Node | string | null, cmds: Command[], binds: GenOut['binds']): void {
  if (oldV === newV) return
  genPatchInner(oldV, newV, parentId(parent), typeof anchor === 'string' ? null : anchor, cmds, binds)
}

export { Fragment }
