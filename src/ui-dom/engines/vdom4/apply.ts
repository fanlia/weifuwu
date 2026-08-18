/**
 * vdom4 apply — 执行器（薄——消费命令 → DOM + 影子 fold + 生命周期）
 *
 * 无决策（命令是 diff 的产物——纯执行）；影子由本层唯一推进（fold 语义——
 * insert/remove/move 维护锚列表/节点登记）；ref/事件/卸载钩子在此执行。
 * 事件绑定：直接 addEventListener（每节点——无代理——vdom4 最小闭环——
 *  事件更新 = setProp 命令（prev handler）→ remove + add）。
 * hydration 吸收：create/insert 按结构队列复用现有 DOM（SSR 首帧零重建）。
 */

import type { Command } from './types.ts'
import type { ShadowState } from './shadow.ts'

/** portal 容器（#__wf_portal > [data-wf-portal-key]——lazy 创建） */
export function ensurePortalContainer(key: string): HTMLElement {
  let rootEl = document.getElementById('__wf_portal')
  if (!rootEl) {
    rootEl = document.createElement('div')
    rootEl.id = '__wf_portal'
    document.body.appendChild(rootEl)
  }
  let c = rootEl.querySelector(`[data-wf-portal-key="${key}"]`) as HTMLElement | null
  if (!c) {
    c = document.createElement('div')
    c.setAttribute('data-wf-portal-key', key)
    rootEl.appendChild(c)
  }
  return c
}

/** 执行器上下文（引擎注入——节点注册表 + 卸载钩子表） */
export interface ApplyEnv {
  registry: Map<string, Node>
  shadow: ShadowState
  /** 卸载钩子（compId → fn[]——unmountComp 时执行） */
  unmountHooks: Map<string, Array<() => void>>
  /** ref 表（id → refFn——create 时记录——移除时 ref(null)——ref 纪律） */
  refs: Map<string, (el: unknown) => void>
}

const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'g', 'defs', 'use', 'text', 'tspan', 'ellipse', 'title', 'desc', 'marker', 'symbol', 'linearGradient', 'radialGradient', 'stop', 'mask', 'pattern', 'clipPath'])

export function applyCommands(cmds: Command[], env: ApplyEnv, root: HTMLElement): void {
  const { registry, shadow, refs } = env
  // create 映射预建（insert 的 ref 查找 O(1)——大列表免 cmds.find O(n²)——
  // VirtualList 100 项 = 1 万次扫描 → 100 次）
  const createVn = new Map<string, { vn?: { props?: Record<string, unknown> } }>()
  for (const c of cmds) if (c.op === 'create') createVn.set(c.id, c as never)
  const resolve = (id: string): Node | null => registry.get(id) ?? null
  const parentOf = (id: string): Node | null => {
    if (id === 'root') return root
    if (id.startsWith('portal:')) return ensurePortalContainer(id.slice(7))
    return resolve(id)
  }

  for (const c of cmds) {
    switch (c.op) {
      case 'create': {
        // hydration 吸收（SSR 零重建——**路径 id 精确匹配**（确定性 id——同声明同路径））
        let el: Element | null = shadow.absorbIdMap ? (shadow.takeAbsorbedById(c.id) as Element | null) : null
        if (!el && shadow.absorbQueue) {
          const existing = shadow.takeAbsorbed((n) => n.nodeType === 1 && (n as Element).tagName.toLowerCase() === c.tag.toLowerCase())
          if (existing) el = existing as Element
        }
        if (!el) {
          el = SVG_TAGS.has(c.tag) ? document.createElementNS('http://www.w3.org/2000/svg', c.tag) : document.createElement(c.tag)
        }
        el.setAttribute('data-v4-id', c.id)
        registry.set(c.id, el)
        // ref 记录（insert 后调用 el——移除时 ref(null)）
        const refFn = c.vn.props?.ref as ((el: unknown) => void) | undefined
        if (typeof refFn === 'function') refs.set(c.id, refFn)
        // props 应用（create 路径全量——事件绑定/ref 在 insert 时）
        applyProps(el, c.vn.props ?? {})
        break
      }
      case 'createText': {
        let t: Text | null = null
        if (shadow.absorbQueue) {
          const existing = shadow.takeAbsorbed((n) => n.nodeType === 3)
          if (existing) { t = existing as Text; t.nodeValue = c.value }
        }
        if (!t) t = document.createTextNode(c.value)
        registry.set(c.id, t)
        break
      }
      case 'createAnchor': {
        let hole: Comment | null = null
        if (shadow.absorbQueue) {
          const existing = shadow.takeAbsorbed((n) => n.nodeType === 8 && (n.nodeValue ?? '').includes('wf-anchor'))
          if (existing) hole = existing as Comment
        }
        if (!hole) hole = document.createComment('wf-anchor')
        registry.set(c.id, hole)
        shadow.registerAnchor(c.id, '')
        break
      }
      case 'insert': {
        const node = registry.get(c.id)
        if (!node) break
        const parentNode = parentOf(c.parent)
        if (!parentNode) break
        const isAnchor = shadow.isAnchor.get(c.id) ?? false
        if (isAnchor) {
          // 锚登记（逻辑容器 = c.parent）——插入位置 = ref 锚区间末尾（下一锚前/父末尾）
          const slotKey = c.parent
          if (c.ref) {
            const refIdx = shadow.indexOfAnchor(slotKey, c.ref)
            shadow.insertAnchor(slotKey, c.id, refIdx + 1)
          } else {
            shadow.insertAnchor(slotKey, c.id, shadow.anchorsOf(slotKey).length)
          }
          shadow.registerAnchor(c.id, slotKey)
          const refNode = c.ref ? resolve(c.ref) : null
          let ins: Node | null = null
          if (refNode) {
            let n = refNode.nextSibling
            while (n && !(n.nodeType === 8 && (n.nodeValue ?? '').includes('wf-anchor'))) n = n.nextSibling
            ins = n
          }
          if (ins && ins.parentNode === parentNode) parentNode.insertBefore(node, ins)
          else parentNode.appendChild(node)
        } else {
          // 吸收节点已在位（跳过插入）——否则插到锚后/append
          if (!shadow.absorbedNodes.has(node)) {
            const refNode = c.ref ? resolve(c.ref) : null
            const ins = c.after && refNode ? refNode.nextSibling : refNode
            if (ins && ins.parentNode === parentNode) parentNode.insertBefore(node, ins)
            else parentNode.appendChild(node)
          }
        }
        shadow.registerNode(c.id, c.parent)
        // ref 回调（挂载）
        const refFn = createVn.get(c.id)?.vn?.props?.ref as ((el: unknown) => void) | undefined
        if (typeof refFn === 'function') { try { refFn(node) } catch { /* ref 失败隔离 */ } }
        break
      }
      case 'setProp': {
        const el = resolve(c.id)
        if (el?.nodeType !== 1) break
        const elEl = el as Element
        // 事件 handler 更新（prev → remove + add）
        if (typeof c.value === 'function' && /^on[A-Z]/.test(c.key)) {
          if (typeof c.prev === 'function') elEl.removeEventListener(c.key.slice(2).toLowerCase(), c.prev as EventListener)
          elEl.addEventListener(c.key.slice(2).toLowerCase(), c.value as EventListener)
          break
        }
        if (typeof c.prev === 'function' && /^on[A-Z]/.test(c.key)) {
          elEl.removeEventListener(c.key.slice(2).toLowerCase(), c.prev as EventListener)
        }
        if (c.value == null) {
          elEl.removeAttribute(c.key)
        } else if (c.key === 'value' && (elEl instanceof HTMLInputElement || elEl instanceof HTMLTextAreaElement)) {
          (elEl as HTMLInputElement | HTMLTextAreaElement).value = String(c.value)
        } else if (c.key === 'style' && typeof c.value === 'object') {
          elEl.setAttribute('style', styleToCss(c.value as Record<string, unknown>))
        } else {
          elEl.setAttribute(c.key, String(c.value))
        }
        break
      }
      case 'setText': {
        const t = resolve(c.id)
            if (t?.nodeType === 3) (t as Text).nodeValue = c.value
        break
      }
      case 'remove': {
        // 锚移除：区间（锚 + 内容到下一锚前）+ anchors splice + 组件实例清理
        if (shadow.isAnchor.get(c.id)) {
          execRemoveSlot(c.id, env)
        } else {
          const node = resolve(c.id)
          if (node?.parentNode) {
            callRefCleanupNode(node, refs)
            node.parentNode.removeChild(node)
          }
          registry.delete(c.id)
          shadow.unregister(c.id)
        }
        break
      }
      case 'clearSlot': {
        execClearSlot(c.anchorId, c.parent, c.nextAnchorId, env)
        break
      }
      case 'moveSlot': {
        execMoveSlot(c.anchorId, c.parent, c.ref, c.nextAnchorId, env)
        break
      }
      case 'unmountComp': {
        const hooks = env.unmountHooks.get(c.compId)
        if (hooks) { for (const h of hooks) { try { h() } catch { /* 清理失败隔离 */ } } env.unmountHooks.delete(c.compId) }
        shadow.deleteInstance(c.compId)
        // 子树 portal 远程内容清理（X-C3：keyed 组件项移除——Row 内 usePopup 浮层残留）
        // id 前缀匹配组件路径 + .p 后缀（输出根 portal：{compId}.c.p / {compId}.p）
        for (const [id, node] of registry) {
          if (id.startsWith(c.compId + '.') && id.endsWith('.p') && node.parentNode) {
            node.parentNode.removeChild(node)
            registry.delete(id)
            shadow.unregister(id)
          }
        }
        break
      }
    }
  }
  shadow.commitAll()
}

/** props 应用（create 路径——事件绑定/属性） */
function applyProps(el: Element, props: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(props)) {
    if (k === 'key' || k === 'children' || k === 'ref') continue
    if (typeof v === 'function' && /^on[A-Z]/.test(k)) {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener)
      continue
    }
    if (v != null && v !== false) {
      if (k === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
        (el as HTMLInputElement | HTMLTextAreaElement).value = String(v)
      } else if (k === 'style' && typeof v === 'object') {
        el.setAttribute('style', styleToCss(v as Record<string, unknown>))
      } else {
        el.setAttribute(k, String(v))
      }
    }
  }
}

export function styleToCss(val: Record<string, unknown>): string {
  return Object.entries(val)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`).join(';')
}

/** 锚槽位区间移除（锚 + 内容——含子锚 anchors 同步/ref(null)） */
function execRemoveSlot(anchorId: string, env: ApplyEnv): void {
  const { registry, shadow, refs } = env
  const anchor = registry.get(anchorId)
  const parent = anchor?.parentNode
  if (!anchor || !parent) return
  // 内容区间（锚后到下一锚前——影子查）
  const parentId = shadow.parentOf.get(anchorId) ?? ''
  const nextAid = shadow.anchorAfter(parentId, anchorId)
  const nextAnchor = nextAid ? registry.get(nextAid) : null
  let n: Node | null = anchor.nextSibling
  while (n && n !== nextAnchor) {
    const nx = n.nextSibling
    const id = registryIdOf(n, registry)
    if (id && shadow.isAnchor.get(id)) shadow.removeAnchor(parentId, id)
    callRefCleanupNode(n, refs)
    parent.removeChild(n)
    if (id) { registry.delete(id); shadow.unregister(id) }
    n = nx
  }
  callRefCleanupNode(anchor, refs)
  parent.removeChild(anchor)
  shadow.removeAnchor(parentId, anchorId)
  shadow.unregister(anchorId)
  registry.delete(anchorId)
}

/** clearSlot：清内容留锚（空洞） */
function execClearSlot(anchorId: string, parentId: string, nextAnchorId: string | null, env: ApplyEnv): void {
  const { registry, shadow, refs } = env
  const anchor = registry.get(anchorId)
  const parent = anchor?.parentNode
  if (!anchor || !parent) return
  const nextAnchor = nextAnchorId ? registry.get(nextAnchorId) : null
  let n = anchor.nextSibling
  while (n && n !== nextAnchor) {
    const nx = n.nextSibling
    const id = registryIdOf(n, registry)
    if (id && shadow.isAnchor.get(id)) shadow.removeAnchor(parentId, id)
    callRefCleanupNode(n, refs)
    parent.removeChild(n)
    if (id) { registry.delete(id); shadow.unregister(id) }
    n = nx
  }
}

/** moveSlot：区间移动（锚 + 内容——keyed 重排） */
function execMoveSlot(anchorId: string, parentId: string, ref: string | null, nextAnchorId: string | null, env: ApplyEnv): void {
  const { registry, shadow } = env
  const anchor = registry.get(anchorId)
  const parent = anchor?.parentNode
  if (!anchor || !parent) return
  const anchors = shadow.anchorsOf(parentId)
  const curIdx = anchors.indexOf(anchorId)
  const prevAid = curIdx > 0 ? anchors[curIdx - 1] : null
  // 已在目标位置（ref 后/首）→ 零操作
  if (ref === null ? anchors[0] === anchorId : prevAid === ref) return
  const refIdx = ref ? anchors.indexOf(ref) : -1
  const insPoint: Node | null = ref ? (anchors[refIdx + 1] ? registry.get(anchors[refIdx + 1]) ?? null : null) : parent.firstChild
  const nextAnchor = nextAnchorId ? registry.get(nextAnchorId) : null
  const range: Node[] = []
  let n: Node | null = anchor
  while (n && n !== nextAnchor) { range.push(n); n = n.nextSibling }
  for (const node of range) parent.insertBefore(node, insPoint)
  shadow.moveAnchorTo(parentId, anchorId, ref)
}

function registryIdOf(n: Node, registry: Map<string, Node>): string | null {
  if (n.nodeType === 1) return (n as Element).getAttribute('data-v4-id')
  for (const [id, node] of registry) if (node === n) return id
  return null
}

/** ref(null)（卸载/清槽——ref 纪律：ref 函数引用变化时旧 ref(null)；
 *  稳定 ref（mount 定义）只在真正卸载时调用） */
function callRefCleanupNode(n: Node, refs: Map<string, (el: unknown) => void>): void {
  const id = n.nodeType === 1 ? (n as Element).getAttribute('data-v4-id') : null
  if (id) {
    const refFn = refs.get(id)
    if (refFn) { try { refFn(null) } catch { /* ref 清理失败隔离 */ } refs.delete(id) }
  }
}
