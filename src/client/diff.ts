/**
 * weifuwu/client 增量 diff — patchValue 及全部 diff 辅助
 *
 * 从 render.ts 拆出（P2 结构拆分）。依赖方向：
 *   diff.ts → render.ts（renderValue/mountComponent/patchPortal/renderPortal）
 *   diff.ts → registry.ts（callRefCleanup）
 *   render.ts 不依赖 diff.ts（单向，无环）
 */

import type { VNode, Component, AsyncComponent } from './vnode.ts'
import { Fragment, Portal } from './vnode.ts'
import type { WfuiContext } from './types.ts'
import { renderValue, mountComponent, patchPortal, renderPortal } from './render.ts'
import { callRefCleanup, idRegistry } from './registry.ts'

// ── 内联 ref 检测 ────────────────────────────────────
// ref-diff 在 ref 函数引用变化时调用旧 ref(null)（见 patchValue）。
// 内联 ref（render 里写 `ref: (el) => {...}`）每次渲染都是新函数 → 每渲染触发一次
// ref(null)+ref(el)，清理逻辑被反复执行而非仅在卸载时。同一元素变化 ≥3 次才警告
// （放过合法的单次/偶发替换，抓住每次渲染都变的内联反模式）。
const _refChurn = new WeakMap<Element, { count: number; warned: boolean }>()

function warnRefChurn(el: Element): void {
  const entry = _refChurn.get(el) ?? { count: 0, warned: false }
  entry.count++
  if (entry.count >= 3 && !entry.warned) {
    entry.warned = true
    console.warn(
      '[weifuwu] ref 函数每次渲染都变化（内联 ref）——ref 回调在每次渲染后重新执行（性能损耗）。' +
      '把 ref 定义到 mount 作用域（稳定引用）：const listRef = (el) => {...}; return h(\'div\', { ref: listRef })',
    )
  }
  _refChurn.set(el, entry)
}

// ── patchValue ─────────────────────────────────────────

export function patchValue(
  parent: Node,
  oldNode: Node | null,
  oldInput: any,
  newInput: any,
  ctx: WfuiContext,
): Node | null {
  // 新增
  if (oldInput == null) {
    if (newInput == null) return null
    const node = renderValue(newInput, ctx)
    if (node == null) return null
    if (oldNode && oldNode.parentNode) {
      oldNode.parentNode.insertBefore(node, oldNode)
    } else {
      parent.appendChild(node)
    }
    return node
  }

  // 删除
  if (newInput == null) {
    if (oldNode) {
      callRefCleanup(oldInput)
      ;(oldNode as ChildNode).remove()
    } else {
      // oldNode 为 null（remote 组件的 _refNode 为 null），但仍需清理 remote 容器
      callRefCleanup(oldInput)
    }
    return null
  }

  const oldType = typeOf(oldInput)
  const newType = typeOf(newInput)

  // 类型不同 → 替换
  if (oldType !== newType) {
    callRefCleanup(oldInput)
    const node = renderValue(newInput, ctx)
    if (node == null) return null
    if (oldNode?.parentNode) {
      oldNode.parentNode.replaceChild(node, oldNode)
    }
    return node
  }

  // 文本
  if (newType === 'text') {
    if (oldNode && oldNode.textContent !== String(newInput)) {
      oldNode.textContent = String(newInput)
    }
    return oldNode
  }

  const newV = newInput as VNode
  const oldV = oldInput as VNode

  // 组件
  if (typeof newV.type === 'function') {
    const comp = newV.type as Component | AsyncComponent

    // 传递 _render（两阶段组件复用 render 函数）+ 保持实例 ID
    if (oldV._render) {
      newV._render = oldV._render
      newV._id = oldV._id
      if (newV._id) idRegistry.set(newV._id, newV)
    }

    // 存 DOM 锚点（供 ctx.ui.render() scope 使用）
    newV._parentNode = parent
    newV._refNode = oldNode

    // 扩展 ctx：注入 _selfId 和 VNode 引用
    const childCtx = Object.create(ctx) as WfuiContext
    childCtx.ui = Object.create(ctx.ui as any) as any
    childCtx.ui._selfId = newV._id
    childCtx.ui._selfVNode = newV

    // ── 传递 ctx 版本号 ──
    newV._ctxVersion = oldV._ctxVersion ?? (childCtx.ui as any)._ctxVersion ?? 0

    // ── 三态 skip：props 没变 + $ 没脏 + ctx 版本一致 → 复用旧输出 ──
    if (
      oldV._render &&
      componentPropsEqual(oldV.props, newV.props) &&
      !(childCtx.ui as any)._dirtySet?.has(oldV._id) &&
      newV._ctxVersion === (childCtx.ui as any)._ctxVersion
    ) {
      // 复用旧 _child（DOM 未变，不需要重新 render）
      newV._child = oldV._child
      return oldNode
    }

    // 消费 dirty 标记（使后续 flushDirtyBatch 不会重复处理）
    ;(childCtx.ui as any)._dirtySet?.delete(oldV._id)

    let childNew
    try {
      if (typeof newV._render === 'function') {
        childNew = newV._render(newV.props)
      } else {
        // fallback: 首次挂载（_render 未传递）——支持 async 工厂（未解析 → 占位 + 完成后重渲染）
        childNew = mountComponent(comp, newV.props, newV, childCtx)
      }
    } catch (e) {
      const errHandler = (ctx as any).ui?._errorHandler
      if (errHandler) {
        errHandler(e)
        childNew = null
      } else {
        console.error(
          `[weifuwu] Component render error in <${comp?.name || 'anonymous'}> (id: ${oldV._id ?? '?'}, phase: update)`,
          e,
        )
        childNew = null
      }
    }
    // 先捕获 oldV._child 再设置 newV._child（防止 oldV === newV 时覆盖自身）
    const _prevChild = oldV._child
    newV._child = childNew

    const returnedNode = patchValue(parent, oldNode, _prevChild, childNew, childCtx)
    // patchValue 返回 null（组件输出为 null），_refNode 指向已移除的节点
    // 置 null 避免下次 render 使用已脱离 DOM 的引用
    if (!returnedNode) newV._refNode = null
    return returnedNode
  }

  // Fragment
  if (newV.type === Fragment) {
    patchChildren(parent, oldV, newV, ctx)
    return oldNode
  }

  // Native element
  if (typeof newV.type === 'string') {
    if (oldNode && oldNode.nodeType === 1) {
      // ref 变化处理：仅新 ref(el) 初始化。
      // 不调用旧 ref(null)——元素仍在挂载中，ref(null) 只在真正卸载时调用
      // （callRefCleanup）。若在替换时调旧 ref(null)，内联 ref（每次渲染新函数）
      // 会在每次重渲染误触发清理分支（退订/dispose/removeEventListener）。
      const oldRef = oldV.props?.ref
      const newRef = newV.props?.ref
      if (oldRef !== newRef) {
        if (typeof newRef === 'function') newRef(oldNode)
        // 内联 ref 检测：新旧都是函数且同一元素反复变化 → 提示提 mount 作用域
        if (typeof oldRef === 'function' && typeof newRef === 'function') warnRefChurn(oldNode as Element)
      }
      patchProps(oldNode as Element, oldV.props, newV.props)
      patchChildren(oldNode, oldV, newV, ctx)
    } else if (oldNode) {
      // oldNode 不是元素节点 → 替换
      callRefCleanup(oldInput)
      const node = renderValue(newInput, ctx)
      if (node == null) return null
      oldNode.parentNode?.replaceChild(node, oldNode)
      return node
    }
    return oldNode
  }

  // Portal
  if (newV.type === Portal) {
    patchPortal(oldV as VNode | null, newV as VNode, ctx)
    return null
  }

  // Array（map 结果等）
  if (Array.isArray(newInput)) {
    const oldArr = Array.isArray(oldInput) ? oldInput : []
    ensureKeys(oldArr, newInput)
    patchKeyedChildren(parent, oldArr, newInput, ctx)
    return oldNode
  }

  return oldNode
}

// ── typeOf ─────────────────────────────────────────────

// 组件类型键缓存：typeOf 每次 patch 都会被调用，`fn:${name}` 字符串拼接
// 是热路径分配；同函数缓存稳定键（保持「不同组件名 → 不同类型 → 替换」语义）
const _fnTypeCache = new Map<Function, string>()
function fnTypeKey(fn: Function): string {
  let key = _fnTypeCache.get(fn)
  if (!key) {
    key = `fn:${(fn as any).name || 'anon'}`
    _fnTypeCache.set(fn, key)
  }
  return key
}

function typeOf(input: any): string {
  if (input == null || typeof input === 'boolean') return 'null'
  if (typeof input === 'string' || typeof input === 'number') return 'text'
  if (Array.isArray(input)) return 'array'
  const v = input as VNode
  if (typeof v.type === 'function') return fnTypeKey(v.type as Function)
  if (v.type === Fragment) return 'fragment'
  if (v.type === Portal) return 'portal'
  if (typeof v.type === 'string') return 'tag:' + v.type
  return 'unknown'
}

// ── patchProps ─────────────────────────────────────────

export function patchProps(el: Element, oldProps: any, newProps: any) {
  const oldKeys = oldProps ? Object.keys(oldProps).filter(k => k !== 'children' && k !== 'key' && k !== 'innerHTML') : []
  const newKeys = newProps ? Object.keys(newProps).filter(k => k !== 'children' && k !== 'key' && k !== 'innerHTML') : []
  // O(n·m) → O(n+m)：旧属性删除判定用 Set 查找
  const newKeySet = new Set(newKeys)

  for (const key of oldKeys) {
    if (!newKeySet.has(key)) {
      if (key === 'ref') continue
      if (key.startsWith('on') && typeof oldProps[key] === 'function') {
        el.removeEventListener(key.slice(2).toLowerCase(), oldProps[key] as EventListener)
      } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        ;(el as HTMLSelectElement).value = ''
      } else {
        el.removeAttribute(key === 'className' ? 'class' : key)
      }
    }
  }

  for (const key of newKeys) {
    if (key === 'ref') continue
    const oldVal = oldProps?.[key]
    const newVal = newProps?.[key]
    if (key === 'innerHTML') {
      if (newVal !== oldVal) (el as HTMLElement).innerHTML = String(newVal ?? '')
    } else if (newVal !== oldVal) {
    if (key === 'class' || key === 'className') {
        if (el instanceof SVGElement) el.setAttribute('class', classToString(newVal))
        else el.className = classToString(newVal)
      } else if (key === 'style' && typeof newVal === 'object') {
        const st = (el as HTMLElement).style
        for (const sk of Object.keys(newVal)) {
          const sv = newVal[sk]
          if (sv != null) (st as any)[sk] = typeof sv === 'number' ? sv + 'px' : String(sv)
        }
      } else if (key.startsWith('on') && typeof newVal === 'function') {
        const eventName = key.slice(2).toLowerCase()
        // 移除旧监听器，防止累积
        if (typeof oldVal === 'function') el.removeEventListener(eventName, oldVal as EventListener)
        el.addEventListener(eventName, newVal as EventListener)
      } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
        ;(el as HTMLSelectElement).value = String(newVal ?? '')
      } else if (newVal === true) {
        el.setAttribute(key, '')
      } else if (newVal != null && newVal !== false) {
        el.setAttribute(key, String(newVal))
      } else {
        if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
          ;(el as HTMLSelectElement).value = ''
        } else {
          el.removeAttribute(key)
        }
      }
    }
  }
}

function classToString(v: any): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.filter(Boolean).join(' ')
  if (v && typeof v === 'object') {
    return Object.entries(v).filter(([, b]) => b).map(([k]) => k).join(' ')
  }
  return ''
}

// ── patchChildren ──────────────────────────────────────

function getKey(input: any): string | undefined {
  if (input == null || typeof input !== 'object') return undefined
  return (input as VNode).key
}

/** 为无 key 的子节点自动分配位置 key，确保 keyed diff 正确性 */
export function ensureKeys(oldChildren: any[], newChildren: any[]) {
  const hasKey = newChildren.some(c => c && typeof c === 'object' && c.key !== undefined)
  if (!hasKey) {
    for (let i = 0; i < newChildren.length; i++) {
      const c = newChildren[i]
      if (c && typeof c === 'object') c.key = i
    }
    for (let i = 0; i < oldChildren.length; i++) {
      const c = oldChildren[i]
      if (c && typeof c === 'object') c.key = i
    }
  }
}

function patchChildren(parent: Node, oldVNode: VNode, newVNode: VNode, ctx: WfuiContext) {
  const oldChildren = normalize(oldVNode.props?.children)
  const newChildren = normalize(newVNode.props?.children)

  // 始终使用 keyed diff，无 key 时自动分配位置 key
  ensureKeys(oldChildren, newChildren)
  patchKeyedChildren(parent, oldChildren, newChildren, ctx)
}

export function normalize(children: any): any[] {
  if (children == null) return []
  if (!Array.isArray(children)) return [children]
  // 展平嵌套数组：JSX 中 {arr.map(...)} 产生 [el, [a,b,c]] 结构
  const result: any[] = []
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...child)
    } else {
      result.push(child)
    }
  }
  return result
}

export function patchKeyedChildren(parent: Node, oldChildren: any[], newChildren: any[], ctx: WfuiContext) {
  const allUnkeyed = !newChildren.some(c => c && typeof c === 'object' && c.key !== undefined)

  if (allUnkeyed) {
    // 全无 key：按位置匹配，不移动 DOM
    const len = Math.max(oldChildren.length, newChildren.length)
    for (let i = 0; i < len; i++) {
      const oldC = i < oldChildren.length ? oldChildren[i] : null
      const newC = i < newChildren.length ? newChildren[i] : null
      if (newC == null) {
        if (oldC != null) {
          callRefCleanup(oldC)
          const node = parent.childNodes[i]
          if (node) (node as ChildNode).remove()
        }
      } else if (oldC == null) {
        const node = renderValue(newC, ctx)
        if (node != null) parent.appendChild(node)
      } else {
        const oldNode = parent.childNodes[i] || null
        patchValue(parent, oldNode, oldC, newC, ctx)
      }
    }
    return
  }

  // 以下为 keyed 子节点路径
  // Step 1: 移除无 key 的旧子节点
  let rmIdx = 0
  for (let i = 0; i < oldChildren.length; i++) {
    const child = oldChildren[i]
    if (child == null || typeof child === 'boolean') continue
    const key = getKey(child)
    if (key === undefined) {
      const node = parent.childNodes[rmIdx]
      if (node) (node as ChildNode).remove()
    } else {
      const isRemote = child && typeof child === 'object' && (child as VNode)._placement === 'remote'
      if (!isRemote) rmIdx++
    }
  }

  // Step 2: Build old key map
  const oldKeyMap = new Map<string, { vnode: any; node: Node | null; remote: boolean; index: number }>()
  let domIdx = 0
  for (let i = 0; i < oldChildren.length; i++) {
    const key = getKey(oldChildren[i])
    if (key !== undefined) {
      const child = oldChildren[i]
      const isRemote = child && typeof child === 'object' && (child as VNode)._placement === 'remote'
      oldKeyMap.set(key, {
        vnode: child,
        node: isRemote ? null : (parent.childNodes[domIdx] || null),
        remote: !!isRemote,
        index: domIdx,
      })
      if (!isRemote) domIdx++
    }
  }

  // Step 3: Remove vanished keys
  const newKeys = newChildren.map(c => getKey(c))
  // O(n²) → O(n)：消失 key 判定用 Set 查找
  const newKeySet = new Set(newKeys)
  for (const key of oldKeyMap.keys()) {
    if (!newKeySet.has(key)) {
      const entry = oldKeyMap.get(key)!
      callRefCleanup(entry.vnode)
      if (entry.node) (entry.node as ChildNode)?.remove()
      oldKeyMap.delete(key)
    }
  }

  // Step 4: Forward patch + move（React-style lastIndex 算法）
  let lastIndex = -1
  let nextRef: Node | null = parent.firstChild
  for (let i = 0; i < newChildren.length; i++) {
    const key = newKeys[i]
    const newChild = newChildren[i]
    const oldEntry = key !== undefined ? oldKeyMap.get(key) : undefined
    const isRemote = newChild && typeof newChild === 'object' && (newChild as VNode)._placement === 'remote'

    if (oldEntry) {
      if (oldEntry.node) {
        if (oldEntry.index < lastIndex) {
          parent.insertBefore(oldEntry.node, nextRef)
        }
        lastIndex = Math.max(lastIndex, oldEntry.index)
        patchValue(parent, oldEntry.node, oldEntry.vnode, newChild, ctx)
        nextRef = (oldEntry.node.parentNode === parent ? oldEntry.node : parent.firstChild)?.nextSibling ?? null
      } else if (oldEntry.remote) {
        patchPortal(oldEntry.vnode, newChild, ctx)
      } else {
        const newNode = patchValue(parent, null, oldEntry.vnode, newChild, ctx)
        if (newNode != null) {
          parent.insertBefore(newNode, nextRef)
          nextRef = newNode.nextSibling
        }
      }
    } else if (isRemote) {
      renderPortal(newChild, ctx)
    } else {
      const node = renderValue(newChild, ctx)
      if (node != null) {
        parent.insertBefore(node, nextRef)
        nextRef = node.nextSibling
      }
    }
  }
}

/**
 * 子节点逐元素浅比较（用于 componentPropsEqual 的 children 维度）
 *
 * 对 string/number 做值比较，VNode 做引用比较。
 * 只做一层，不递归（JSX 编译的 flat children 是一维数组）。
 */
function childrenEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false
    }
    return true
  }
  return a === b
}

/**
 * 组件级 props 浅比较——包含 children 的元素级比较
 *
 * 与 props 不同，组件的 children 是 render 函数的输入之一。
 * children 为 ['点击 ', count, ' 次'] 时，count 值变必须触发 render。
 * 但数组引用不同而内容相同的情况（每次 JSX 新数组），用 childrenEqual 避免误判。
 */
function componentPropsEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const key of keys) {
    if (key === 'key') continue
    if (key === 'children') {
      if (!childrenEqual(a[key], b[key])) return false
    } else if (a[key] !== b[key]) {
      return false
    }
  }
  return true
}

/** 浅比较两个 props 对象，跳过 children/key */
function propsEqual(a: any, b: any): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const aKeys = Object.keys(a).filter(k => k !== 'children' && k !== 'key')
  const bKeys = Object.keys(b).filter(k => k !== 'children' && k !== 'key')
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false
  }
  return true
}
