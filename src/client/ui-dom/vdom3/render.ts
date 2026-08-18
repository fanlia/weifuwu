/**
 * vdom3 render — 渲染执行器：**构建后的纯树** → 命令（diff 决策）→ 执行（apply）→ DOM
 *
 * vdom4 P0（命令化 diff）：决策与执行分离——
 *   gen 系列（diff）：读 vnode/DOM 状态 → 决策 → 生成 Command[]（**不写 DOM**）
 *   applyCommands（执行）：消费命令 → DOM 操作 + DOM 层事件流发射（单点）
 *
 * vdom4 P1（锚点法 + 影子状态）：**每个 children 数组槽位恒有一个注释锚**
 * （`<!--wf-anchor-->`——内容在其后）——槽位 i ⟷ shadow.anchors[parent][i]——
 * 位置 O(1) 查询——domIdx/widthOf/_outFirst/_outLast 宽度推导全部消灭；
 * 空洞（false/null）槽位 = 只有锚（占位法并入锚点法）；
 * 锚恒在 → 重建/移除的 anchor 捕获 bug 类别从根上消除（锚失效 = 结构损坏）。
 * 影子由 apply（fold）唯一推进——gen 只读（声明可以陈旧，影子不能）。
 *
 * 决策层事件（diff:transition/vnode:patch/diff:mode）在 gen 阶段发射；
 * DOM 层事件（node/prop/text/ref/event/portal 的 create/insert/remove/update 等）统一在 apply 发射。
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
 * （真实事故：components-demo 2000 slider 刷新后 input.value=100 而数值显示 800）。
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
import { shadow } from './shadow.ts'

/** 节点注册表（id ↔ Node——命令执行定位）——模块级可变（per-call 注入——测试隔离） */
let registry = new NodeRegistry()
export { registry }

// ══════════════════════════════════════════════════════════════════════
// 命令（P0/P1——diff 决策的产物——DOM = fold(命令)）
// ══════════════════════════════════════════════════════════════════════

/** 命令（vn 是内部引用（props/ref——序列化剥离）；parent 是父节点 id；
 *  ref 是锚（Node 或 id——after=true 时插到 ref 之后——锚语义）；causeId 决策链） */
export type Command =
  | { op: 'create'; id: string; tag: string; vn: VNode }
  | { op: 'createText'; id: string; value: string }
  | { op: 'createAnchor'; id: string }
  | { op: 'insert'; id: string; parent: string; ref: Node | string | null; after?: boolean; slotParent?: string; slotRef?: string | null; vn?: VNode | null; causeId?: string | null }
  | { op: 'setProp'; id: string; key: string; value: unknown; prev: unknown; vn?: VNode | null }
  | { op: 'setText'; id: string; value: string; vn?: VNode | null }
  | { op: 'bind'; id: string; event: string; handler: EventListener; parent: string | null }
  | { op: 'callRef'; id: string; kind: 'mount' | 'cleanup'; fn: (el: any) => void }
  | { op: 'remove'; id: string; parent?: string; vn?: VNode | null; nextAnchorId?: string | null; causeId?: string | null }
  | { op: 'clearSlot'; anchorId: string; parent: string; nextAnchorId?: string | null; vn?: VNode | null; causeId?: string | null }
  | { op: 'removePortal'; portalKey: string; vn?: VNode | null; causeId?: string | null }
  | { op: 'unmountComp'; compId: string; type: unknown }
  | { op: 'moveSlot'; anchorId: string; parent: string; ref: string | null; nextAnchorId?: string | null; key?: string | null; causeId?: string | null }
  | { op: 'portalOpenCheck'; portalKey: string; wasEmpty: boolean }

/** gen 输出：命令 + 回填计划（组件 el 定位——apply 后按 id 回填——gen 不接触 DOM） */
export interface GenOut {
  cmds: Command[]
  binds: Array<{ vn: VNode; firstId: string | null; portalKey?: string }>
}

// ══════════════════════════════════════════════════════════════════════
// apply（执行器——写 DOM + 影子 fold + DOM 层事件发射——唯一副作用点）
// ══════════════════════════════════════════════════════════════════════

/** 执行命令序列（同步——命令顺序 = 原操作顺序——影子/事件流 = fold(命令)） */
export function applyCommands(cmds: Command[], binds: GenOut['binds'] = []): void {
  for (const c of cmds) {
    switch (c.op) {
      case 'create': {
        // hydration 吸收（P5）：现有 DOM 节点按结构队列复用——首帧零重建
        // （DOM 状态保持：焦点/选区/第三方库——SSR 与客户端同构保证顺序一致）
        let el: Element
        const existing = shadow.takeAbsorbed((n) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === c.tag.toLowerCase())
        if (existing) {
          el = existing as Element
          el.setAttribute('data-v3-id', c.id) // 覆盖为客户端 id（registry/事件代理定位）
        } else {
          el = SVG_TAGS.has(c.tag)
            ? document.createElementNS('http://www.w3.org/2000/svg', c.tag)
            : document.createElement(c.tag)
          el.setAttribute('data-v3-id', c.id)
        }
        registry.register(c.id, el)
        shadow.registerNode(c.id, null)
        c.vn.el = el
        stream.emit(ev('node', 'create', c.id, { tag: c.tag, absorbed: existing != null || undefined }))
        break
      }
      case 'createText': {
        const existing = shadow.takeAbsorbed((n) => n.nodeType === 3)
        const t = (existing as Text) ?? document.createTextNode(c.value)
        if (existing) t.nodeValue = c.value // 复用文本——值对齐（SSR 确定性——通常无变化）
        registry.register(c.id, t)
        shadow.registerNode(c.id, null)
        stream.emit(ev('text', 'create', c.id, { value: c.value, absorbed: existing != null || undefined }))
        break
      }
      case 'createAnchor': {
        const existing = shadow.takeAbsorbed((n) => n.nodeType === 8 && (n.nodeValue ?? '').includes('wf-anchor'))
        const hole = (existing as Comment) ?? document.createComment('wf-anchor')
        registry.register(c.id, hole)
        shadow.registerAnchor(c.id, '')
        stream.emit(ev('node', 'create', c.id, { kind: 'anchor', absorbed: existing != null || undefined }))
        break
      }
      case 'insert': {
        const node = registry.get(c.id)
        if (!node) break
        const parentNode = resolveParent(c.parent)
        if (!parentNode) break
        const isAnchor = shadow.isAnchor.get(c.id) ?? false
        const slotKey = c.slotParent ?? c.parent
        let insPoint: Node | null
        if (isAnchor) {
          // 锚插入：DOM 插到 ref（DOM 前驱 = 上一槽位锚）的**区间末尾**——
          // （ref 锚后的内容之后/下一锚前——ref.nextSibling 是内容第一个——插那里会反序）
          // **列表定位用 slotRef（前一槽位锚——ref 可能是子锚不在列表）**
          const refNode = typeof c.ref === 'string' ? registry.get(c.ref) : c.ref
          let insPoint2: Node | null = null
          if (refNode && refNode.parentNode === parentNode) {
            let n = refNode.nextSibling
            while (n && !(n.nodeType === 8 && (n.nodeValue ?? '').includes('wf-anchor'))) n = n.nextSibling
            insPoint2 = n // 下一锚（区间边界）或 null（父末尾——append）
          }
          insPoint = insPoint2
          if (c.slotRef) {
            const refIdx = shadow.indexOfAnchor(slotKey, c.slotRef)
            shadow.insertAnchor(slotKey, c.id, refIdx + 1)
          } else {
            shadow.insertAnchor(slotKey, c.id, 0)
          }
          shadow.registerAnchor(c.id, slotKey)
        } else {
          const refNode = typeof c.ref === 'string' ? registry.get(c.ref) : c.ref
          insPoint = c.after && refNode ? refNode.nextSibling : refNode
        }
        // 吸收节点已在位（SSR DOM）——跳过插入（结构同构保证位置一致——零重建）
        if (!shadow.absorbedNodes.has(node)) {
          if (insPoint && insPoint.parentNode === parentNode) parentNode.insertBefore(node, insPoint)
          else parentNode.appendChild(node)
        }
        shadow.registerNode(c.id, c.parent)
        stream.emit(ev('node', 'insert', c.id, { parent: parentId(parentNode), ref: typeof c.ref === 'string' ? c.ref : c.ref ? nodeId(c.ref) : null, after: c.after ?? false, isAnchor: isAnchor || undefined, causeId: c.causeId ?? undefined }))
        // 插入后补注册（svg/深层元素——挂载点监听缺失——真实 hover 事故）
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
        if (shadow.isAnchor.get(c.id)) {
          execRemoveSlot(c.id, c.parent ?? '', c.nextAnchorId ?? null, c.vn, c.causeId)
          break
        }
        const node = registry.get(c.id)
        if (!node) break
        removeNodeWithLifecycle(node, node.parentNode ?? document.body, c.vn, c.causeId)
        shadow.unregister(c.id)
        break
      }
      case 'clearSlot': {
        execClearSlot(c.anchorId, c.parent, c.nextAnchorId ?? null, c.vn, c.causeId)
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
      case 'moveSlot': {
        execMoveSlot(c.anchorId, c.parent, c.ref, c.nextAnchorId ?? null, c.key, c.causeId)
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
  // 回填计划（组件 el 定位——apply 完成后统一回填）
  for (const b of binds) {
    if (b.portalKey != null) {
      b.vn.el = ensurePortalContainer(b.portalKey)
      continue
    }
    b.vn.el = b.firstId ? registry.get(b.firstId) : null
  }
}

/** parent id 解析（'root'/'portal:key'/普通 id——registry 查） */
function resolveParent(id: string): Node | null {
  return registry.get(id)
}

/** 锚槽位内容区间（锚后到下一锚前——apply 时遍历移除——含子锚的 anchors 同步 + 监听清理） */
function removeSlotContent(anchorId: string, nextAnchorId: string | null, parent: Node, parentIdStr: string, causeId?: string | null): void {
  const anchor = registry.get(anchorId)
  if (!anchor?.parentNode) return
  const nextAnchor = nextAnchorId ? registry.get(nextAnchorId) : null
  let n = anchor.nextSibling
  while (n && n !== nextAnchor) {
    const nx = n.nextSibling
    const id = registry.idOf(n)
    if (shadow.isAnchor.get(id)) shadow.removeAnchor(parentIdStr, id)
    unbindAll(id)
    removeDomNode(n, parent, causeId)
    shadow.unregister(id)
    n = nx
  }
}

/** remove（锚）命令执行：锚 + 内容区间移除（anchors splice） */
function execRemoveSlot(anchorId: string, parentId: string, nextAnchorId: string | null, vn: VNode | null | undefined, causeId?: string | null): void {
  const anchor = registry.get(anchorId)
  const parent = anchor?.parentNode
  if (vn) callRefCleanup(vn)
  if (anchor && parent) {
    removeSlotContent(anchorId, nextAnchorId, parent, parentId, causeId)
    unbindAll(registry.idOf(anchor))
    removeDomNode(anchor, parent, causeId)
  }
  shadow.removeAnchor(parentId, anchorId)
  shadow.unregister(anchorId)
}

/** clearSlot 命令执行：清空锚后内容（锚保留——空洞） */
function execClearSlot(anchorId: string, parentId: string, nextAnchorId: string | null, vn: VNode | null | undefined, causeId?: string | null): void {
  const anchor = registry.get(anchorId)
  const parent = anchor?.parentNode
  if (vn) callRefCleanup(vn)
  if (anchor && parent) removeSlotContent(anchorId, nextAnchorId, parent, parentId, causeId)
  void parentId
}

/** moveSlot 命令执行：区间 [锚, 下一锚) 整体移动到 **ref 锚区间的末尾**（ref 的下一锚前/父末尾——
 *  keyed 重排——锚随内容走。insPoint 不得用 ref.nextSibling（那是 ref 区间的第一个内容——
 *  区间应插到 ref 区间之后）。已在目标位置（prevAid === ref / 已是首锚）→ 零操作。 */
function execMoveSlot(anchorId: string, parentId: string, ref: string | null, nextAnchorId: string | null, key: string | null | undefined, causeId?: string | null): void {
  const anchor = registry.get(anchorId)
  if (!anchor?.parentNode) return
  const parent = anchor.parentNode as Element
  const anchors = shadow.anchorsOf(parentId)
  const curIdx = anchors.indexOf(anchorId)
  // 跳过判定：锚已在 ref 之后（或已是首锚——ref=null）
  const prevAid = curIdx > 0 ? anchors[curIdx - 1] : null
  if (ref === null ? anchors[0] === anchorId : prevAid === ref) {
    return
  }
  const refIdx = ref ? anchors.indexOf(ref) : -1
  const insPoint = ref
    ? (anchors[refIdx + 1] ? registry.get(anchors[refIdx + 1]) : null)
    : parent.firstChild
  if (insPoint === anchor) return
  const nextAnchor = nextAnchorId ? registry.get(nextAnchorId) : null
  // 收集区间（移动前——移动中 nextSibling 变化）——prev 也移动前捕获（undo 恢复用）
  const range: Node[] = []
  let n: Node | null = anchor
  while (n && n !== nextAnchor) { range.push(n); n = n.nextSibling }
  const prev = anchor.previousSibling ? registry.idOf(anchor.previousSibling) : null
  // 逐个 insertBefore（从前往后——相对顺序保持）
  for (const node of range) parent.insertBefore(node, insPoint)
  shadow.moveAnchorTo(parentId, anchorId, ref)
  // 锚 move 事件浓缩区间（range = 区间节点 id 列表——回放/undo 可整体移动——
  // 单锚事件保持 undo 的「最近一个指令 = 一次区间移动」语义）
  stream.emit(ev('node', 'move', anchorId, {
    parent: nodeId(parent),
    ref: insPoint ? registry.idOf(insPoint) : null,
    prev,
    key: key ?? null,
    range: range.map((n) => registry.idOf(n)),
    causeId: causeId ?? undefined,
  }))
}

/** 属性应用（create/setProp 共用——set 逻辑收敛单点） */
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

/** 统一节点移除（node:remove 事件 + unregister——占位/文本的直接移除也要事件流） */
function removeDomNode(n: Node, parent: Node, causeId?: string | null): void {
  const id = registry.idOf(n)
  if (id && id !== 'el' && id !== 'node') {
    stream.emit(ev('node', 'remove', id, { parent: parentId(parent), causeId: causeId ?? undefined }))
    registry.unregister(id, n)
  }
  n.parentNode?.removeChild(n)
}

/** 节点移除的完整清理（REMOVE 事件 + EVENT_UNBIND + ref(null) + registry） */
export function removeNodeWithLifecycle(node: Node, parent: Node, vnodeRef?: VNode | null, causeId?: string | null): void {
  const beforeUnbind = (globalThis as { __WF_V3_AUDIT?: string }).__WF_V3_AUDIT !== '0' ? listenerCount(registry.idOf(node)) : 0
  unbindAll(registry.idOf(node))
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

/** 递归调 ref(null)（移除树——ref 纪律：卸载清理（lockScroll/focus）依赖——REF_CLEANUP 事件） */
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
 * （DOM 挂各自独立容器）必须一并清空——否则幽灵面板残留（NavMenu 事故） */
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

/** removePortal 命令执行：远程容器清空（子树 REMOVE 事件 + ref(null)——ref 纪律） */
export function removePortalContentExec(portalKey: string, pv: VNode | null | undefined, causeId?: string | null): void {
  if (pv) for (const c of childrenOf(pv)) removeNestedPortals(c)
  // 容器不存在 → 无内容可清（不创建——关闭/清理不产生副作用——幽灵空容器消除）
  const container = document.getElementById('__wf_portal')
    ?.querySelector(`[data-wf-portal-key="${portalKey}"]`) as HTMLElement | null
  if (!container) return
  if (pv) callRefCleanup(pv)
  for (const child of [...container.childNodes]) {
    unbindAll(registry.idOf(child))
    const cid = registry.idOf(child)
    stream.emit(ev('node', 'remove', cid, { parent: NodeRegistry.PORTAL(portalKey), causeId: causeId ?? undefined }))
    container.removeChild(child)
    registry.unregister(cid, child)
    shadow.unregister(cid)
  }
  if (container.childNodes.length === 0) {
    stream.emit(ev('portal', 'close', undefined, { portalKey }))
  }
}

/** 兼容导出（vdom2/vdom3 调用方签名——PortalVNode → portalKey+vn） */
export function removePortalContent(pv: PortalVNode): void {
  removePortalContentExec(String(pv.props?.portalKey ?? 'default'), pv, null)
}

/** 卸载树（dispose 协议——P3——应用/根销毁的统一清理）：
 *  组件卸载钩子 → ref(null) 递归 → 事件解绑（delegate）→ 索引注销 → portal 容器清空
 *  ——修复 RootHandle.unmount 只清 innerHTML 的泄漏（监听残留/钩子不跑/ref 不清理） */
export function disposeTree(v: VNode | null | undefined): void {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return
  const vn = v as VNode
  // portal：内容独立挂载（远程容器）——清空（含 ref/嵌套 portal）——子节点不在本容器
  if (isPortalNode(vn)) {
    removePortalContentExec(String(vn.props?.portalKey ?? 'default'), vn, null)
    return
  }
  // 组件：卸载钩子 + COMP_UNMOUNT 事件 + 索引注销
  if (typeof vn.type === 'function' && vn._id) {
    runUnmountHooks(vn._id)
    stream.emit(ev('comp', 'unmount', vn._id, { name: compName(vn.type) }))
    unindexComponent(vn._id)
  }
  // ref(null)（ref 纪律：卸载清理——lockScroll/focus 依赖）
  const refFn = vn.props?.ref
  if (typeof refFn === 'function') {
    const el = vn.el
    stream.emit(ev('ref', 'cleanup', el ? registry.idOf(el) : 'null'))
    try { refFn(null) } catch { /* ref 失败隔离 */ }
  }
  // 事件解绑（delegate 注册表——移除后事件仍响应的泄漏）
  if (vn.el) unbindAll(registry.idOf(vn.el))
  // 递归：组件输出 + children
  const child = vn._child
  if (child != null && typeof child === 'object' && !Array.isArray(child)) disposeTree(child as VNode)
  for (const c of childrenOf(vn)) {
    if (c != null && typeof c === 'object' && !Array.isArray(c)) disposeTree(c as VNode)
  }
}

// ══════════════════════════════════════════════════════════════════════
// diff（决策——gen 系列——不写 DOM——生成命令）
// ══════════════════════════════════════════════════════════════════════

/** 挂载：纯树 → 命令 → DOM（SSR 旧内容同帧移除——保持语义） */
export function mount(vnode: VNode, root: HTMLElement, reg?: NodeRegistry): void {
  const prev = registry
  if (reg) registry = reg
  try {
    ensureDelegationRoot(root)
    registry.register(NodeRegistry.ROOT, root)
    const ssrOld = [...root.childNodes]
    // hydration 吸收（P5）：检测 SSR 内容（data-v3-id 节点 / wf-anchor 注释——引擎标记——
    // boot-loading 等无标记占位不误判）→ 结构队列——apply 复用零重建
    const hasSsr = ssrOld.some((n) =>
      (n.nodeType === 1 && (n as Element).hasAttribute('data-v3-id'))
      || (n.nodeType === 8 && (n.nodeValue ?? '').includes('wf-anchor')))
    if (hasSsr) shadow.beginAbsorb(root)
    const cmds: Command[] = []
    const binds: GenOut['binds'] = []
    genRender(vnode, NodeRegistry.ROOT, null, cmds, binds)
    applyCommands(cmds, binds)
    // 移除未吸收的旧内容（SSR 结构之外的——boot-loading 占位等——吸收节点保留）
    for (const n of ssrOld) {
      if (n.parentNode === root && !shadow.absorbedNodes.has(n)) root.removeChild(n)
    }
    shadow.endAbsorb()
  } finally {
    registry = prev
  }
}

/** 渲染 vnode（gen——同步——生成命令 + 回填计划）
 *  parentId：父节点 id（'root'/'portal:key'/native id——apply 时解析）
 *  anchor：插入锚（string = 锚 id——内容插锚后；Node = insertBefore；null = append）
 *  返回：该子树在命令序列中的 DOM 范围（firstId = 首内容节点 id——空输出 null） */
function genRender(vn0: VNode, parentId: string, anchor: Node | string | null, cmds: Command[], binds: GenOut['binds'], slotKey?: string): { firstId: string; lastId: string; lastAnchorId: string | null } | null {
  const vnode = vn0 as VNode
  // 组件/app 节点：输出 _child（已构建——直接渲染输出；el 定位组件输出首节点）
  if (typeof vnode.type === 'function' || vnode.type === App) {
    const output = vnode._child !== undefined ? vnode._child : childrenOf(vnode)[0] ?? null
    if (output == null) { binds.push({ vn: vnode, firstId: null }); return null }
    // 已渲染（isConnected（真实 DOM/portal 容器）或 el 在父内（测试容器未连接））→ 复用
    if (vnode.el != null && (vnode.el.isConnected || vnode.el.parentNode === resolveParent(parentId))) return null
    const r = genRender(output as VNode, parentId, anchor, cmds, binds)
    binds.push({ vn: vnode, firstId: r?.firstId ?? null })
    return r
  }
  if (isFragmentNode(vnode)) {
    let first: string | null = null
    let last: string | null = null
    // Fragment 输出锚（anchor）作为首项锚基线——内容项锚序列插输出锚后
    // （mount：null（append）；组件输出恢复：输出锚后——不得 append 到父末尾）
    let refAnchor = typeof anchor === 'string' ? anchor : null
    let prevSlotAnchor: string | null = null
    // 逻辑容器：Fragment 输出内部锚登记到 Fragment 锚（不混入父列表——槽位线性索引保持）
    const fragKey = typeof anchor === 'string' ? anchor : (slotKey ?? parentId)
    for (const c of childrenOf(vnode)) {
      const r = genSlot(c, parentId, refAnchor, prevSlotAnchor, cmds, binds, fragKey)
      if (r) { if (!first) first = r.firstId; last = r.lastId; refAnchor = r.lastAnchorId; prevSlotAnchor = r.anchorId }
    }
    binds.push({ vn: vnode, firstId: first })
    return first ? { firstId: first, lastId: last!, lastAnchorId: refAnchor } : null
  }
  if (isPortalNode(vnode)) {
    const pv = vnode as PortalVNode
    const portalKey = String(pv.props?.portalKey ?? 'default')
    const container = ensurePortalContainer(portalKey)
    registry.register(NodeRegistry.PORTAL(portalKey), container)
    ensureDelegationRoot(container)
    let first: string | null = null
    let last: string | null = null
    const wasEmpty = container.childNodes.length === 0
    let prevSlotAnchor: string | null = null
    for (const c of childrenOf(pv)) {
      const r = genSlot(c, NodeRegistry.PORTAL(portalKey), null, prevSlotAnchor, cmds, binds, NodeRegistry.PORTAL(portalKey))
      if (r) { if (!first) first = r.firstId; last = r.lastId; prevSlotAnchor = r.anchorId }
    }
    cmds.push({ op: 'portalOpenCheck', portalKey, wasEmpty })
    binds.push({ vn: pv, firstId: null, portalKey })
    return first ? { firstId: first, lastId: last!, lastAnchorId: null } : null
  }
  // native
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
  cmds.push({ op: 'insert', id, parent: parentId, ref: anchor, after: typeof anchor === 'string', vn: vnode, causeId: currentCause })
  // children：每槽位 [锚, 内容]（P1 锚点法——空洞 = 只有锚）
  let lastAnchorId: string | null = null
  let prevSlotAnchor: string | null = null
  for (const c of childrenOf(vnode)) {
    const r = genSlot(c, id, lastAnchorId, prevSlotAnchor, cmds, binds, slotKey)
    if (r) { lastAnchorId = r.lastAnchorId; prevSlotAnchor = r.anchorId }
  }
  // native 单节点——范围 = 自身；lastAnchorId = null（children 的锚在自身内部——
  // 不属于父层——genSlot 的 vnode 分支以自身锚兜底）
  return { firstId: id, lastId: id, lastAnchorId: null }
}

/** 渲染子节点（gen——文本/空洞/native/组件/portal——**每槽位恒一锚**：
 *  [锚, 内容...]——空洞槽位 = 只有锚——内容插锚后（after=true））
 *  refAnchor：前一槽位锚（新锚插它之后——顺序保持）；返回 { firstId, lastId, anchorId } */
function genSlot(c: FlatChild, parentId: string, refAnchor: string | null, slotRefAnchor: string | null, cmds: Command[], binds: GenOut['binds'], slotKey?: string): { firstId: string; lastId: string; anchorId: string; lastAnchorId: string } | null {
  // 锚（每槽恒一——空洞也建）——slotParent = 逻辑容器（Fragment 输出内部登记到 Fragment 锚）
  // refAnchor = DOM 前驱（上一槽位区间末尾锚——可能为子锚）；slotRefAnchor = 前一槽位锚（列表定位）
  const anchorId = nextNodeId()
  cmds.push({ op: 'createAnchor', id: anchorId })
  cmds.push({ op: 'insert', id: anchorId, parent: parentId, ref: refAnchor, after: refAnchor != null, slotParent: slotKey, slotRef: slotRefAnchor })
  if (c == null || c === false || c === true) {
    // 空洞：只有锚（占位法并入锚点法）
    return { firstId: anchorId, lastId: anchorId, anchorId, lastAnchorId: anchorId }
  }
  if (typeof c === 'string' || typeof c === 'number') {
    const id = nextNodeId()
    cmds.push({ op: 'createText', id, value: String(c) })
    cmds.push({ op: 'insert', id, parent: parentId, ref: anchorId, after: true })
    return { firstId: id, lastId: id, anchorId, lastAnchorId: anchorId }
  }
  // vnode 项：锚记录（组件/Fragment 的 patch 定位）——lastAnchorId = 输出区间末尾锚
  const vn = c as VNode
  vn._anchorId = anchorId
  const r = genRender(vn, parentId, anchorId, cmds, binds)
  const lastAnchorId = r?.lastAnchorId ?? anchorId
  vn._lastAnchorId = lastAnchorId
  return { firstId: r?.firstId ?? anchorId, lastId: r?.lastId ?? anchorId, anchorId, lastAnchorId }
}

/**
 * patch：旧树 vs 新树 → 命令 → apply。同位置同类型（含 key）复用——仅变化发命令。
 */
export function patch(oldV: VNode | null, newV: VNode | string | number | null | undefined | boolean, parent: Node, anchor?: Node | null, reg?: NodeRegistry): Node | null {
  const prev = registry
  if (reg) registry = reg
  try {
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
function beginCause(): string {
  causeStack.push(currentCause)
  currentCause = `c${++causeUid}`
  return currentCause
}
function endCause(): void {
  currentCause = causeStack.pop() ?? null
}

/** 单节点 kind 分类（diff:transition 决策事件的 from/to） */
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
    cmds.push({ op: 'insert', id, parent: parentIdStr, ref: anchor, after: anchor != null })
    return
  }
  if (newV == null || newV === false || newV === true) {
    if (oldV != null && typeof oldV === 'object' && !Array.isArray(oldV)) {
      if (isPortalNode(oldV)) {
        cmds.push({ op: 'removePortal', portalKey: String((oldV as PortalVNode).props?.portalKey ?? 'default'), vn: oldV as VNode })
      } else if (oldV.el && oldV.el.parentNode === resolveParent(parentIdStr)) {
        cmds.push({ op: 'remove', id: nodeId(oldV.el), vn: oldV as VNode })
      }
    }
    return
  }
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

  // 异类型：rebuild（非槽位单节点场景——槽位场景在 genPatchChildren 走 clearSlot+新内容）
  emitPatch(oldIsVNode ? classifyKind(oldV) : null, classifyKind(vn), 'rebuild')
  if (oldIsVNode) {
    const oldEl = (oldV as VNode).el
    if (oldEl && oldEl.parentNode === resolveParent(parentIdStr)) {
      const rebuildAnchor = oldEl.nextSibling ?? anchor
      if (typeof (oldV as VNode).type === 'function' && (oldV as VNode)._id) {
        cmds.push({ op: 'unmountComp', compId: (oldV as VNode)._id!, type: (oldV as VNode).type })
      }
      cmds.push({ op: 'remove', id: nodeId(oldEl), vn: oldV as VNode })
      genRender(vn, parentIdStr, rebuildAnchor, cmds, binds)
      return
    } else if (isPortalNode(oldV)) {
      cmds.push({ op: 'removePortal', portalKey: String((oldV as PortalVNode).props?.portalKey ?? 'default'), vn: oldV as VNode })
    }
  }
  genRender(vn, parentIdStr, anchor, cmds, binds)
}

/** 属性 diff（同类型复用——仅变化发命令） */
function genPatchProps(el: Element, oldProps: Record<string, unknown>, newProps: Record<string, unknown>, cmds: Command[]): void {
  const target = nodeId(el)
  const allKeys = new Set([...Object.keys(oldProps ?? {}), ...Object.keys(newProps ?? {})])
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
    if (ov != null && nv != null && typeof ov === 'object' && typeof nv === 'object'
        && !Array.isArray(ov) && !Array.isArray(nv)
        && shallowEqual(ov as Record<string, unknown>, nv as Record<string, unknown>)) continue
    if (typeof nv === 'function' && /^on[A-Z]/.test(key)) {
      cmds.push({ op: 'bind', id: target, event: key.slice(2).toLowerCase(), handler: nv as EventListener, parent: null })
      continue
    }
    cmds.push({ op: 'setProp', id: target, key, value: nv, prev: ov ?? '' })
  }
}

/** PATCH 决策事件（kind 分发可观测/可断言） */
function emitPatch(oldKind: VKind | null, newKind: VKind, action: 'reuse' | 'rebuild' | 'move' | 'remove' | 'unhandled'): void {
  stream.emit(ev('vnode', 'patch', undefined, { oldKind, newKind, strategy: action }))
}

// ── kind 同类型处理器表 ──

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
  vn._anchorId = ov._anchorId
  vn._lastAnchorId = ov._lastAnchorId
  genPatchProps(el, ov.props, vn.props, cmds)
  genPatchChildren(ov, vn, el, cmds, binds)
}

/** 组件：复用实例（_render 保持）——输出已由 build 更新——patch 子树 */
function genPatchCompKind(ov: VNode, vn: VNode, parentIdStr: string, anchor: Node | null, cmds: Command[], binds: GenOut['binds']): void {
  vn._render = ov._render
  vn._id = ov._id
  vn._anchorId = ov._anchorId
  const out = vn._child !== undefined ? vn._child : childrenOf(vn)[0] ?? null
  const oldOut = ov._child !== undefined ? ov._child : childrenOf(ov)[0] ?? null
  if (out == null || out === false || out === true) {
    // 组件输出 null：清空槽位内容（锚保留——实例保留——下次输出恢复）
    if (oldOut && isPortalNode(oldOut)) {
      cmds.push({ op: 'removePortal', portalKey: String((oldOut as PortalVNode).props?.portalKey ?? 'default'), vn: oldOut as VNode })
    } else if (ov._anchorId) {
      // 区间边界 = **首锚的下一锚（父列表）**——组件输出内部子锚登记在输出锚的
      // 逻辑容器（Fragment 列表）——不在父列表——末尾锚查父列表 = 空——必须用首锚
      cmds.push({ op: 'clearSlot', anchorId: ov._anchorId, parent: parentIdStr, nextAnchorId: shadow.anchorAfter(parentIdStr, ov._anchorId), vn: ov })
    } else if (ov.el) {
      cmds.push({ op: 'remove', id: nodeId(ov.el), vn: ov })
      ov.el = null
    }
    vn.el = null
    return
  }
  if (ov.el == null || !(ov.el.isConnected || ov.el.parentNode === resolveParent(parentIdStr))) {
    genRender(vn, parentIdStr, ov._anchorId ?? anchor, cmds, binds)
    return
  }
  // 组件输出变化 → patch 子树（组件 el 保持——输出首节点定位）
  genPatchInner(oldOut as VNode | null, out as VNode, parentIdStr, anchor, cmds, binds)
  vn.el = ov.el
}

/** Fragment：children 级 patch（children 展开在父容器——锚列表偏移对齐） */
function genPatchFragKind(ov: VNode, vn: VNode, parentIdStr: string, _anchor: Node | null, cmds: Command[], binds: GenOut['binds']): void {
  // Fragment 逻辑容器：子项锚登记在 Fragment 锚列表（基 0——不偏移父列表）
  const fragKey = ov._anchorId ?? fragmentBaseIndex(ov)
  const base = typeof fragKey === 'string' ? 0 : fragKey
  genPatchChildren(ov, vn, resolveParent(parentIdStr) as Element, cmds, binds, base, typeof fragKey === 'string' ? fragKey : undefined)
  const firstChild = childrenOf(ov).find((c): c is VNode => c != null && typeof c === 'object' && !Array.isArray(c))
  vn.el = ov.el ?? (firstChild?.el ?? null)
}

/** portal：内容 patch 到远程容器（同 key 复用） */
function genPatchPortalKind(ov: VNode, vn: VNode, _parentIdStr: string, _anchor: Node | null, cmds: Command[], binds: GenOut['binds']): void {
  const portalKey = String(vn.props?.portalKey ?? 'default')
  const container = ensurePortalContainer(portalKey)
  registry.register(NodeRegistry.PORTAL(portalKey), container)
  genPatchChildren(ov, vn, container, cmds, binds)
  vn.el = container
}

const KIND_PATCHERS: Partial<Record<VKind, (ov: VNode, vn: VNode, parentIdStr: string, anchor: Node | null, cmds: Command[], binds: GenOut['binds']) => void>> = {
  native: genPatchNativeKind,
  comp: genPatchCompKind,
  app: genPatchCompKind,
  frag: genPatchFragKind,
  portal: genPatchPortalKind,
  text: undefined,
  null: undefined,
}

/** Fragment 首节点在父容器的索引（兜底——无锚时——DOM 扫描） */
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

/** keyed 移动（重排优化）：moveSlot 命令（锚 + 内容区间整体移动） */
function genMoveKeyedNodes(oldKids: VNodeChild[], newKids: VNodeChild[], el: Element, cmds: Command[]): void {
  const oldKeyIdx = new Map<string, number>()
  oldKids.forEach((k, i) => {
    if (isVNode(k) && k.key != null) oldKeyIdx.set(k.key, i)
  })
  const parentIdStr = nodeId(el)
  let prevAnchorId: string | null = null // 新序列前一个已处理项的锚
  for (let i = 0; i < newKids.length; i++) {
    const nc = newKids[i]
    if (!isVNode(nc) || nc.key == null) { prevAnchorId = null; continue }
    const oi = oldKeyIdx.get(nc.key)
    let anchorId: string | null = null
    if (oi != null && isVNode(oldKids[oi])) anchorId = (oldKids[oi] as VNode)._anchorId ?? null
    if (anchorId && shadow.anchorsOf(parentIdStr).includes(anchorId)) {
      cmds.push({ op: 'moveSlot', anchorId, parent: parentIdStr, ref: prevAnchorId, nextAnchorId: shadow.anchorAfter(parentIdStr, anchorId), key: nc.key, causeId: currentCause })
      prevAnchorId = anchorId
    }
  }
}

/** 全 keyed 列表 diff：区间移动（MOVE）+ 按 key 配对 patch + 新增/移除 */
function genPatchKeyedChildren(oldKids: VNodeChild[], newKids: VNodeChild[], el: Element, cmds: Command[], binds: GenOut['binds']): void {
  const oldMap = new Map<string, VNode>()
  for (const k of oldKids) if (isVNode(k) && k.key != null) oldMap.set(k.key, k)
  const parentIdStr = nodeId(el)
  genMoveKeyedNodes(oldKids, newKids, el, cmds)
  let prevAnchorId: string | null = null
  for (const nc of newKids) {
    const nv = nc as VNode
    const oc = oldMap.get(nv.key ?? '') ?? null
    if (oc && oc !== nv) {
      genPatch(oc, nv, el, null, cmds, binds)
      prevAnchorId = nv._anchorId ?? oc._anchorId ?? prevAnchorId
    } else if (!oc) {
      const r = genSlot(nv, parentIdStr, prevAnchorId, prevAnchorId, cmds, binds)
      prevAnchorId = r?.anchorId ?? prevAnchorId
    } else {
      // 同引用复用（结构共享——DOM 已在位、零 diff）——prev 锚推进
      prevAnchorId = nv._anchorId ?? oc._anchorId ?? prevAnchorId
    }
  }
  // 移除无新 key 的旧项（锚区间）
  const newKeys = new Set(newKids.filter((k) => isVNode(k)).map((k) => (k as VNode).key))
  for (const ok of oldKids) {
    if (isVNode(ok) && ok.key != null && !newKeys.has(ok.key) && (ok as VNode)._anchorId) {
      const aid = (ok as VNode)._anchorId!
      if (shadow.anchorsOf(parentIdStr).includes(aid)) {
        if (typeof ok.type === 'function' && ok._id) {
          cmds.push({ op: 'unmountComp', compId: ok._id, type: ok.type })
        }
        cmds.push({ op: 'remove', id: aid, parent: parentIdStr, nextAnchorId: shadow.anchorAfter(parentIdStr, aid), vn: ok })
      }
    }
  }
}

/** children diff（锚点法——槽位 i ⟷ shadow.anchors[parent][anchorBase+i]——O(1) 定位） */
const warnedDynamicArrays = new Set<string>()

function genPatchChildren(oldV: VNode, newV: VNode, el: Element, cmds: Command[], binds: GenOut['binds'], anchorBase = 0, slotKey?: string): void {
  const oldKids = childrenOf(oldV)
  const newKids = childrenOf(newV)
  const keyMode = newKids.length > 1 && newKids.every((k) => isVNode(k) && k.key != null) ? 'keyed' : 'unkeyed'
  stream.emit(ev('diff', 'mode', undefined, { mode: keyMode, len: newKids.length, prevLen: oldKids.length, level: 'trace' }))
  // A 级动态检测（长度变化 + 无 key 组件项 → dev error——portal 槽豁免）
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
  // 全 keyed 列表 → keyed diff（区间移动——DOM 状态保持）
  if (newKids.length > 1 && newKids.every((k) => isVNode(k) && k.key != null)) {
    genPatchKeyedChildren(oldKids, newKids, el, cmds, binds)
    return
  }

  // ── 锚点法（P1）：槽位游标推进——oldAnchors 只含数组项锚（组件/Fragment 输出
  //  内部锚登记到各自逻辑容器——不混入——每槽消费一个锚——无 domIdx/widthOf 推导） ──
  const parentIdStr = nodeId(el)
  const slotKeyStr = slotKey ?? parentIdStr
  const oldAnchors = shadow.anchorsOf(slotKeyStr)
  const len = Math.max(oldKids.length, newKids.length)
  let lastAnchorId: string | null = null // 新序列最后一个已处理槽位锚（新锚插它之后）
  let anchorCursor = anchorBase // 旧锚游标（每槽 +1——列表 = 数组项锚）
  for (let i = 0; i < len; i++) {
    const oc = i < oldKids.length ? oldKids[i] : null
    const nc = i < newKids.length ? newKids[i] : null
    const oldAnchor = oldAnchors[anchorCursor] ?? null

    if (i >= newKids.length) {
      // 旧项多余——移除槽位（锚 + 内容区间）——组件实例先卸载；portal 远程容器先清
      // （filter(Boolean) 类输出收缩——portal 项走移除分支而非空洞分支——漏清远程 = 幽灵面板）
      if (oldAnchor) {
        if (oc != null && typeof oc === 'object' && !Array.isArray(oc) && typeof (oc as VNode).type === 'function' && (oc as VNode)._id) {
          cmds.push({ op: 'unmountComp', compId: (oc as VNode)._id!, type: (oc as VNode).type })
        }
        if (oc != null && typeof oc === 'object' && !Array.isArray(oc) && isPortalNode(oc)) {
          cmds.push({ op: 'removePortal', portalKey: String((oc as PortalVNode).props?.portalKey ?? 'default'), vn: oc as VNode })
        }
        cmds.push({ op: 'remove', id: oldAnchor, parent: slotKeyStr, nextAnchorId: oldAnchors[anchorCursor + 1] ?? null, vn: (oc != null && typeof oc === 'object' && !Array.isArray(oc)) ? (oc as VNode) : null })
      }
      anchorCursor++
      continue
    }
    // 槽位锚：复用旧锚（同位置）或新建（插到前一锚后）
    let slotAnchor = oldAnchor
    if (!slotAnchor) {
      slotAnchor = nextNodeId()
      cmds.push({ op: 'createAnchor', id: slotAnchor })
      cmds.push({ op: 'insert', id: slotAnchor, parent: parentIdStr, ref: lastAnchorId, after: lastAnchorId != null, slotParent: slotKeyStr, slotRef: lastAnchorId })
    }
    lastAnchorId = slotAnchor
    anchorCursor++
    const nextAnchor = oldAnchors[anchorCursor] ?? null

    if (typeof nc === 'string' || typeof nc === 'number') {
      const str = String(nc)
      // 旧槽位内容（锚后兄弟——O(1) DOM 读）
      const anchorNode = registry.get(slotAnchor)
      const firstContent = anchorNode?.nextSibling ?? null
      if (oc != null && typeof oc !== 'object' && firstContent?.nodeType === 3) {
        // 旧文本 → 更新（同一文本节点——无需重建）
        if (firstContent.nodeValue !== str) {
          cmds.push({ op: 'setText', id: nodeId(firstContent), value: str })
        }
      } else {
        // 占位/旧节点 → 文本（clearSlot + createText 插锚后）
        if (firstContent) {
          cmds.push({ op: 'clearSlot', anchorId: slotAnchor, parent: parentIdStr, nextAnchorId: nextAnchor })
        }
        const id = nextNodeId()
        cmds.push({ op: 'createText', id, value: str })
        cmds.push({ op: 'insert', id, parent: parentIdStr, ref: slotAnchor, after: true })
      }
      continue
    }
    if (nc == null || nc === false || nc === true) {
      // 空洞：清空旧内容（锚保留——锚即空洞——占位法并入锚点法）
      // 组件项从 children 移除 = 实例销毁（索引注销）——区别于「组件输出 null」（实例保留）
      if (oc != null && typeof oc === 'object' && !Array.isArray(oc) && typeof (oc as VNode).type === 'function' && (oc as VNode)._id) {
        cmds.push({ op: 'unmountComp', compId: (oc as VNode)._id!, type: (oc as VNode).type })
      }
      if (oc != null && typeof oc === 'object' && !Array.isArray(oc) && isPortalNode(oc)) {
        cmds.push({ op: 'removePortal', portalKey: String((oc as PortalVNode).props?.portalKey ?? 'default'), vn: oc as VNode })
      }
      const anchorNode = registry.get(slotAnchor)
      if (anchorNode?.nextSibling) {
        beginCause()
        try {
          cmds.push({ op: 'clearSlot', anchorId: slotAnchor, parent: parentIdStr, nextAnchorId: nextAnchor, vn: (oc != null && typeof oc === 'object' && !Array.isArray(oc)) ? (oc as VNode) : null, causeId: currentCause })
        } finally { endCause() }
      }
      continue
    }
    if (oc != null && typeof oc === 'object' && (oc as VNode).type === (nc as VNode).type) {
      // 同类型（位置语义）——patch 复用（锚不动）
      genPatch(oc as VNode, nc as VNode, el, null, cmds, binds, slotKeyStr)
    } else {
      // 异类型/空洞→真实：**先清旧内容**（clearSlot——锚保留）→ 新内容插锚后
      // （顺序必须：先 clear 后 render——clearSlot 移除锚后全部内容——含新内容）
      beginCause()
      try {
        const anchorNode = registry.get(slotAnchor)
        const hasContent = !!anchorNode?.nextSibling
        if (oc != null && typeof oc === 'object' && !Array.isArray(oc) && isPortalNode(oc)) {
          cmds.push({ op: 'removePortal', portalKey: String((oc as PortalVNode).props?.portalKey ?? 'default'), vn: oc as VNode })
        } else if (hasContent) {
          cmds.push({ op: 'clearSlot', anchorId: slotAnchor, parent: parentIdStr, nextAnchorId: nextAnchor, vn: (oc != null && typeof oc === 'object' && !Array.isArray(oc)) ? (oc as VNode) : null })
        }
        genRender(nc as VNode, parentIdStr, slotAnchor, cmds, binds)
      } finally { endCause() }
    }
  }
  auditOrder(el, newV)
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
function genPatch(oldV: VNode, newV: VNode, parent: Node, anchor: Node | string | null, cmds: Command[], binds: GenOut['binds'], slotKey?: string): void {
  if (oldV === newV) return
  genPatchInner(oldV, newV, parentId(parent), anchor ? (typeof anchor === 'string' ? null : anchor) : null, cmds, binds)
  void slotKey
}

export { Fragment }
