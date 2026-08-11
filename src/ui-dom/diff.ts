/**
 * weifuwu/ui-dom 增量 diff — patchValue 及全部 diff 辅助
 *
 * 从 render.ts 拆出（P2 结构拆分）。依赖方向：
 *   diff.ts → render.ts（renderValue/mountComponent/patchPortal/renderPortal）
 *   diff.ts → registry.ts（callRefCleanup）
 *   render.ts 不依赖 diff.ts（单向，无环）
 */

import type { VNode, VNodeChild, Component } from './vnode.ts'
import type { UiInternal } from './ui.ts'
import { Fragment, Portal } from './vnode.ts'
import { uiDebugEnabled, uiLog } from './debug.ts'
import type { WfuiContext } from './types.ts'
import { renderValue, mountComponent, patchPortal, renderPortal } from './render.ts'
import { callRefCleanupFor, getRegistry, nextComponentIdFor } from './registry.ts'

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

let __pvDepth = 0
export function patchValue(
  parent: Node,
  oldNode: Node | null,
  oldInput: VNodeChild,
  newInput: VNodeChild,
  ctx: WfuiContext,
): Node | null {
  if (uiDebugEnabled()) {
    const oldT = oldInput != null && typeof oldInput === 'object' ? (oldInput as any).type?.name ?? String((oldInput as any).type).slice(0, 20) : String(typeof oldInput)
    const newT = newInput != null && typeof newInput === 'object' ? (newInput as any).type?.name ?? String((newInput as any).type).slice(0, 20) : String(typeof newInput)
    uiLog('patchValue', 'old=' + oldT + ' new=' + newT)
  }
  // 新增
  if (oldInput == null) {
    if (newInput == null) return null
    const node = renderValue(newInput, ctx)
    if (node == null) return null
    if (oldNode && oldNode.parentNode) {
      // 注释锚点（wf-async/wf-empty 占位）→ replace（占位补全不残留——insertBefore 会留注释，
      // 导致 DOM 与 vnode children 错位 → 含 async 组件的数组再次 diff 时重复插入（chat 消息×2 事故））
      if (oldNode.nodeType === 8 /* COMMENT_NODE */) {
        oldNode.parentNode.replaceChild(node, oldNode)
      } else {
        oldNode.parentNode.insertBefore(node, oldNode)
      }
    } else {
      parent.appendChild(node)
    }
    return node
  }

  // 删除
  if (newInput == null) {
    if (oldNode) {
      callRefCleanupFor(oldInput, getRegistry(ctx))
      ;(oldNode as ChildNode).remove()
    } else {
      // oldNode 为 null（remote 组件的 _refNode 为 null），但仍需清理 remote 容器
      callRefCleanupFor(oldInput, getRegistry(ctx))
    }
    return null
  }

  const oldType = typeOf(oldInput)
  const newType = typeOf(newInput)

  // 类型不同 → 替换
  if (oldType !== newType) {
    callRefCleanupFor(oldInput, getRegistry(ctx))
    const node = renderValue(newInput, ctx)
    if (node == null) return null
    if (oldNode?.parentNode) {
      oldNode.parentNode.replaceChild(node, oldNode)
    } else if (!node.parentNode) {
      // oldNode 缺失/已脱离 DOM（组件补全替换后旧锚点被移除，serve 的 oldVNode
      // 仍指向旧 vnode → _refNode null/陈旧）→ 自愈追加
      // （node 未落地才 append——keyed 调用方已 insert 的不重复）
      parent.appendChild(node)
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
    const comp = newV.type as Component

    // 传递 _render（两阶段组件复用 render 函数）+ 保持实例 ID
    // ——仅类型相同时：组件切换（AppShell→SplitWorkspace）必须重新 mount，
    // 复用旧 _render 会渲染成旧组件（壳内容区首次切换不更新的根因）
    if (oldV.type === newV.type && oldV._render) {
      newV._render = oldV._render
      newV._id = oldV._id
      if (newV._id) getRegistry(ctx).idRegistry.set(newV._id, newV)
    }
    // 首次挂载组件（diff 路径——动态挂载/update 新组件）：分配 id（renderByIds 局部补全依赖）
    if (!newV._id) {
      const reg = getRegistry(ctx)
      newV._id = nextComponentIdFor(reg)
      reg.idRegistry.set(newV._id, newV)
    }

    // 存 DOM 锚点（供 ctx.ui.render() scope 使用）
    // 只用非 null 锚点：组件曾输出 null（如 Markdown 空 content）时 oldNode 为 null，
    // 无条件覆盖会把 _refNode 置 null → 后续 patch mapChildDomNodes 读 null →
    // 原生元素路径静默跳过 → 流式 DOM 停更（Chat token 只渲染开头根因）
    newV._parentNode = parent
    if (oldNode) newV._refNode = oldNode

    // 扩展 ctx：注入 _selfId 和 VNode 引用
    const childCtx = Object.create(ctx) as WfuiContext
    childCtx.ui = Object.create(ctx.ui) as WfuiContext['ui'] & UiInternal
    const childUi = childCtx.ui as WfuiContext['ui'] & UiInternal
    childUi._selfId = newV._id
    childUi._selfVNode = newV

    // ── 传递 ctx 版本号 ──
    newV._ctxVersion = oldV._ctxVersion ?? childUi._ctxVersion ?? 0

    // ── 三态 skip：props 没变 + $ 没脏 + ctx 版本一致 → 复用旧输出 ──
    const skipType = oldV._render && oldV.type === newV.type
    const skipProps = componentPropsEqual(oldV.props, newV.props)
    const skipDirty = !childUi._dirtySet?.has(oldV._id as string)
    const skipVersion = newV._ctxVersion === childUi._ctxVersion
    const _cname = (comp as any)?.name ?? 'anon'
    if (uiDebugEnabled()) {
      const name = (comp as any)?.name ?? 'anon'
      uiLog('tri-state-skip', name + ' type=' + skipType + ' props=' + skipProps + ' dirty=' + skipDirty + ' ver=' + skipVersion)
    }
    if (skipType && skipProps && skipDirty && skipVersion) {
      // 复用旧 _child（DOM 未变，不需要重新 render）
      newV._child = oldV._child
      return oldNode
    }

    // 消费 dirty 标记（使后续 flushDirtyBatch 不会重复处理）
    childUi._dirtySet?.delete(oldV._id as string)

    let childNew
    try {
      if (newV._child != null) {
        // buildVNode 已展开（含子树 async 解析——工厂/renderFn 只跑一次）
        childNew = newV._child
      } else if (typeof newV._render === 'function') {
        childNew = newV._render(newV.props)
      } else {
        // fallback: 首次挂载（_render 未传递）——支持 async 工厂（未解析 → 占位 + 局部补全）
        childNew = mountComponent(comp, newV.props, newV, childCtx)
      }
    } catch (e) {
      const errHandler = (ctx.ui as (WfuiContext['ui'] & UiInternal) | undefined)?._errorHandler
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
    // _refNode 必须总是对齐本次渲染的实际 DOM：returnedNode 非 null 时覆盖
    // （旧锚点可能陈旧——组件补全替换后旧 DOM 被移除，留着指向已脱离的节点，
    //   后续 diff oldNode.parentNode=false → 替换不落地 → 页面不更新）；
    // 组件输出 null 时置 null（避免引用已移除节点）
    if (returnedNode) newV._refNode = returnedNode
    else newV._refNode = null
    return returnedNode
  }

  // Fragment
  if (newV.type === Fragment) {
    // 用 oldV._childNodes 精确对齐 Fragment 的 DOM 范围（Fragment 展开成多个直属节点，
    // 不能按父级 `parent.childNodes[i]` 位置索引——兄弟节点中间的 Fragment 会串位）
    const oldRange = oldV._childNodes
    const newRange = patchChildren(parent, oldV, newV, ctx, oldRange)
    newV._childNodes = newRange
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
      callRefCleanupFor(oldInput, getRegistry(ctx))
      const node = renderValue(newInput, ctx)
      if (node == null) return null
      oldNode.parentNode?.replaceChild(node, oldNode)
      return node
    } else {
      // oldNode 丢失（组件曾输出 null → _refNode 失效；如 Markdown 空 content 占位）
      // 但旧输出非空——静默跳过会让 DOM 永不更新（Chat 流式 token 停更根因）。
      // 自愈：先移除旧输出 DOM（vnode.el 持有），再重新渲染插入（新增路径等价）
      const oldDom = (oldInput as VNode).el ?? (oldInput as VNode)._refNode
      callRefCleanupFor(oldInput, getRegistry(ctx))
      if (oldDom && oldDom.parentNode) (oldDom as ChildNode).remove()
      const node = renderValue(newInput, ctx)
      if (node == null) return null
      parent.appendChild(node)
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
    // 数组作为组件输出时可能位于父级非零位置：从 oldNode 起映射 DOM 范围
    const parentNodes = Array.from(parent.childNodes)
    const fromIdx = oldNode ? parentNodes.indexOf(oldNode as ChildNode) : -1
    const nodes = fromIdx >= 0
      ? mapChildDomNodes(parentNodes.slice(fromIdx), oldArr)
      : mapChildDomNodes(parentNodes, oldArr)
    patchKeyedChildren(parent, oldArr, newInput, ctx, nodes, oldNode)
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
    key = `fn:${fn.name || 'anon'}`
    _fnTypeCache.set(fn, key)
  }
  return key
}

function typeOf(input: VNodeChild): string {
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

export function patchProps(el: Element, oldProps: Record<string, unknown> | null, newProps: Record<string, unknown>) {
  if (uiDebugEnabled()) uiLog('patchProps', 'oldKeys=' + (oldProps ? Object.keys(oldProps).length : 0) + ' newKeys=' + Object.keys(newProps).length)
  const oldKeys = oldProps ? Object.keys(oldProps).filter(k => k !== 'children' && k !== 'key' && k !== 'innerHTML') : []
  const newKeys = newProps ? Object.keys(newProps).filter(k => k !== 'children' && k !== 'key' && k !== 'innerHTML') : []
  // O(n·m) → O(n+m)：旧属性删除判定用 Set 查找
  const newKeySet = new Set(newKeys)

  for (const key of oldKeys) {
    if (!oldProps) break // oldKeys 非空意味着 oldProps 非空（TS 收窄辅助）
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
      } else if (key === 'style' && typeof newVal === 'object' && newVal !== null) {
        const st = (el as HTMLElement).style
        const styleVal = newVal as Record<string, unknown>
        for (const sk of Object.keys(styleVal)) {
          const sv = styleVal[sk]
          if (sv == null) {
            // 新 style 中 undefined/null 的 key 必须移除旧值（否则残留——
            // AutoComplete 下拉 display: undefined 残留 none 的根因）
            if (sk.startsWith('--')) st.removeProperty(sk)
            else (st as unknown as Record<string, string>)[sk] = ''
          } else {
            // CSS 变量必须 setProperty（patch 路径与 setProp 对齐——
            // AppShell 折叠 --wf-sidebar-width 不更新的根因）；数值保持字符串（不转 px）
            if (sk.startsWith('--')) st.setProperty(sk, String(sv))
            // 普通 camelCase 键走索引赋值（setProperty 需 kebab-case，camelCase 会失效）；数值转 px
            else (st as unknown as Record<string, string>)[sk] = typeof sv === 'number' ? sv + 'px' : String(sv)
          }
        }
      } else if (key.startsWith('on') && typeof newVal === 'function') {
        const eventName = key.slice(2).toLowerCase()
        // 移除旧监听器，防止累积
        if (typeof oldVal === 'function') el.removeEventListener(eventName, oldVal as EventListener)
        el.addEventListener(eventName, newVal as EventListener)
      } else if (key === 'draggable') {
        // enumerated 属性：空字符串 = false——显式 'true'/'false'
        el.setAttribute('draggable', newVal ? 'true' : 'false')
      } else if (key.startsWith('aria-') && typeof newVal === 'boolean') {
        // aria-* 枚举语义（同 draggable）——显式 'true'/'false'（ReasoningBlock CDD 暴露）
        el.setAttribute(key, newVal ? 'true' : 'false')
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

function getKey(input: VNodeChild): string | undefined {
  if (input == null || typeof input !== 'object') return undefined
  // keyed diff 中数组子项无 key（position 复用）；仅 VNode 有 key
  return Array.isArray(input) ? undefined : (input as VNode).key
}

/** 为无 key 的子节点自动分配位置 key，确保 keyed diff 正确性 */
export function ensureKeys(oldChildren: VNodeChild[], newChildren: VNodeChild[]) {
  const hasKey = newChildren.some(c => c && typeof c === 'object' && !Array.isArray(c) && (c as VNode).key !== undefined)
  if (!hasKey) {
    for (let i = 0; i < newChildren.length; i++) {
      const c = newChildren[i]
      if (c && typeof c === 'object' && !Array.isArray(c)) (c as VNode).key = String(i)
    }
    for (let i = 0; i < oldChildren.length; i++) {
      const c = oldChildren[i]
      if (c && typeof c === 'object' && !Array.isArray(c)) (c as VNode).key = String(i)
    }
  }
}

/**
 * 将 children 映射到它们实际产生的 DOM 节点（每个 child 一个 Node[]）。
 *
 * 1 VNode ≠ 1 DOM 节点：Fragment 展开成多个直属节点（_childNodes），
 * null/boolean/Portal 产生 0 个。explicitNodes 提供限定范围（Fragment 子项
 * 用其自身 _childNodes），否则从 source（parent.childNodes 或给定快照）按计数游标分配。
 */
export function mapChildDomNodes(source: Node[], children: VNodeChild[]): (Node[] | null)[] {
  const out: (Node[] | null)[] = []
  let idx = 0
  for (const c of children) {
    if (c == null || typeof c === 'boolean') { out.push(null); continue }
    const v = c as VNode
    if (v.type === Portal) { out.push(null); continue } // remote：无直属 DOM
    if (v.type === Fragment) {
      const fragNodes = v._childNodes
      if (Array.isArray(fragNodes) && fragNodes.length > 0) {
        out.push(fragNodes.slice())
        idx += fragNodes.length
      } else {
        out.push(source[idx] ? [source[idx]] : null)
        idx += 1
      }
    } else if (typeof v.type === 'function') {
      if (v._render) {
        // 已挂载组件：用实际渲染的 DOM 记录定位（_refNode 单节点 / _childNodes Fragment）
        // ——不假设占 1 位：渲染为 null 的组件（closed Drawer/Modal）_refNode=null 无 DOM，
        // 假设占位会让后续子项 idx 错位（壳内容区首次切换不更新的根因）
        const refNode = v._childNodes ?? v._refNode
        if (refNode == null) {
          out.push(null) // 渲染 null：无 DOM、不推进 idx
        } else if (Array.isArray(refNode)) {
          out.push(refNode.slice())
          idx += refNode.length
        } else {
          out.push([refNode])
          idx += 1
        }
      } else {
        // async 工厂未解析（占位）：逻辑占 1 位——按 source 推进
        // （占位补全 diff 依赖此位置——复用旧 DOM 锚点做 insertBefore）
        out.push(source[idx] ? [source[idx]] : null)
        idx += 1
      }
    } else {
      // 原生元素 VNode：渲染时必占 1 DOM——按 source 位置推进
      if (typeof process !== 'undefined' && process.env.DBG) console.error('[map] idx=', idx, 'type=', v.type, 'sourceLen=', source.length, 'hit=', !!source[idx])
      out.push(source[idx] ? [source[idx]] : null)
      idx += 1
    }
  }
  return out
}

/**
 * patch 子节点；返回 newVNode 的新 DOM 范围（Fragment 场景）。
 * oldNodesOverride：old children 的实际 DOM 节点范围（Fragment 用 _childNodes）。
 */
function patchChildren(
  parent: Node,
  oldVNode: VNode,
  newVNode: VNode,
  ctx: WfuiContext,
  oldNodesOverride?: Node[],
): Node[] {
  if (uiDebugEnabled()) uiLog('patchChildren', 'old=' + (oldVNode.props?.children as any)?.length + ' new=' + (newVNode.props?.children as any)?.length)
  const oldChildren = normalize(oldVNode.props?.children)
  const newChildren = normalize(newVNode.props?.children)

  // 始终使用 keyed diff，无 key 时自动分配位置 key
  ensureKeys(oldChildren, newChildren)

  const source = oldNodesOverride ?? Array.from(parent.childNodes)
  const oldNodes = mapChildDomNodes(source, oldChildren)
  const newRanges = patchKeyedChildren(parent, oldChildren, newChildren, ctx, oldNodes, oldNodesOverride?.[0] ?? null)

  // 新 DOM 范围（Fragment 续用）：展平各子项节点，剔除空项
  const range: Node[] = []
  for (const nodes of newRanges) {
    if (nodes && nodes.length > 0) range.push(...nodes)
  }
  return range
}

export function normalize(children: VNodeChild): VNodeChild[] {
  if (children == null) return []
  if (!Array.isArray(children)) return [children]
  // 展平嵌套数组：JSX 中 {arr.map(...)} 产生 [el, [a,b,c]] 结构
  const result: VNodeChild[] = []
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...child)
    } else {
      result.push(child)
    }
  }
  return result
}

function collectNodes(node: Node | null): Node[] {
  if (node == null) return []
  if (node instanceof DocumentFragment) return Array.from(node.childNodes)
  return [node]
}

/**
 * keyed 子节点 diff。返回每个 new child 的 DOM 节点范围（newNodes，可为空）。
 * oldNodes：old children → 实际 DOM 节点（mapChildDomNodes 结果）。
 */
export function patchKeyedChildren(
  parent: Node,
  oldChildren: VNodeChild[],
  newChildren: VNodeChild[],
  ctx: WfuiContext,
  oldNodes: (Node[] | null)[] = [],
  rangeStart: Node | null = null,
): (Node[] | null)[] {
  if (uiDebugEnabled()) uiLog('patchKeyedChildren', 'old=' + oldChildren.length + ' new=' + newChildren.length)
  // remote（portal）的 key 是内部定位（createPortal portalKey）——不算用户 keyed。
  // 否则 [input(无key), portal(key)] 走 keyed 分支 → 无 key 项 Step1 移除重建 →
  // 受控 input 焦点丢失（AutoComplete/Select 真实 bug——此前组件手动加 key 治标）
  const allUnkeyed = !newChildren.some(c =>
    c && typeof c === 'object' && !Array.isArray(c) && c.key !== undefined
    && (c as VNode)._placement !== 'remote'
  )

  if (allUnkeyed) {
    // 全无 key（含 portal——内部 key 不计）：按位置匹配，不移动 DOM
    const len = Math.max(oldChildren.length, newChildren.length)
    for (let i = 0; i < len; i++) {
      const oldC = i < oldChildren.length ? oldChildren[i] : null
      const newC = i < newChildren.length ? newChildren[i] : null
      if (newC == null) {
        if (oldC != null) {
          callRefCleanupFor(oldC, getRegistry(ctx))
          for (const n of oldNodes[i] ?? []) (n as ChildNode).remove()
        }
      } else if (oldC == null) {
        const node = renderValue(newC, ctx)
        if (node != null) {
          // 插入到下一个已有 DOM 兄弟前（而非 append 末尾）——async 占位补全
          // 位置正确（A 未解析占位 → 补全后插到 '-' 前）；兄弟定位用 oldNodes
          // 后续项（map 修复后 null 组件不占位——索引对齐实际 DOM）
          let next: Node | null = null
          for (let j = i + 1; j < oldNodes.length; j++) {
            const n = oldNodes[j]?.[0]
            if (n && n.parentNode === parent) { next = n; break }
          }
          if (next) parent.insertBefore(node, next)
          else parent.appendChild(node)
        }
      } else {
        const oldNode = oldNodes[i]?.[0] ?? null
        patchValue(parent, oldNode, oldC, newC, ctx)
      }
    }
    return []
  }

  // Step 1: 移除无 key 的旧子节点（用映射出的实际 DOM 节点，引用移除不受后续索引影响）
  for (let i = 0; i < oldChildren.length; i++) {
    const child = oldChildren[i]
    if (child == null || typeof child === 'boolean') continue
    if (getKey(child) === undefined) {
      for (const n of oldNodes[i] ?? []) (n as ChildNode).remove()
    }
  }

  // Step 2: Build old key map（nodes = 实际 DOM 节点引用，移动/删除后依然有效）
  const oldKeyMap = new Map<string, { vnode: VNode; nodes: Node[]; index: number }>()
  let domOrder = 0
  for (let i = 0; i < oldChildren.length; i++) {
    const key = getKey(oldChildren[i])
    if (key !== undefined) {
      oldKeyMap.set(key, { vnode: oldChildren[i] as VNode, nodes: oldNodes[i] ?? [], index: domOrder++ })
    }
  }

  // Step 3: Remove vanished keys
  const newKeys = newChildren.map(c => getKey(c))
  const newKeySet = new Set(newKeys)
  for (const key of [...oldKeyMap.keys()]) {
    if (!newKeySet.has(key)) {
      const entry = oldKeyMap.get(key)!
      callRefCleanupFor(entry.vnode, getRegistry(ctx))
      for (const n of entry.nodes) (n as ChildNode)?.remove()
      oldKeyMap.delete(key)
    }
  }

  // Step 4: Forward patch + move（React-style lastIndex 算法）
  // rangeStart：patch 范围起点（Fragment 子项以其首节点为锚，而非 parent.firstChild）
  const newNodes: (Node[] | null)[] = new Array(newChildren.length).fill(null)
  let lastIndex = -1
  let nextRef: Node | null = rangeStart && rangeStart.parentNode === parent ? rangeStart : parent.firstChild
  for (let i = 0; i < newChildren.length; i++) {
    const key = newKeys[i]
    // keyed 路径的子项假定 VNode 语义（有 key 的条目必为 VNode）
    const newChild = newChildren[i] as VNode | null
    const oldEntry = key !== undefined ? oldKeyMap.get(key) : undefined
    const isRemote = newChild && typeof newChild === 'object' && newChild._placement === 'remote'

    if (oldEntry) {
      if (oldEntry.nodes.length > 0) {
        // 需要移动时整段 range 一起移（Fragment 多节点保持顺序）
        if (oldEntry.index < lastIndex) {
          for (const n of oldEntry.nodes) parent.insertBefore(n, nextRef)
        }
        lastIndex = Math.max(lastIndex, oldEntry.index)
        patchValue(parent, oldEntry.nodes[0], oldEntry.vnode, newChild, ctx)
        // Fragment 子项由 patchValue 更新 _childNodes；其余沿用原节点
        newNodes[i] = (newChild as VNode)._childNodes
          ?? oldEntry.nodes.filter(n => n.parentNode === parent)
        const lastNode = newNodes[i]![newNodes[i]!.length - 1]
        nextRef = lastNode?.nextSibling ?? null
      } else if (isRemote) {
        patchPortal(oldEntry.vnode, newChild, ctx)
        newNodes[i] = []
      } else {
        // 旧条目无 DOM 节点（旧输出为 null/Portal）→ 走 patchValue 完整过渡（含 Portal 清理）
        const node = patchValue(parent, null, oldEntry.vnode, newChild, ctx)
        newNodes[i] = collectNodes(node)
        for (const n of newNodes[i]!) parent.insertBefore(n, nextRef)
        const lastNode = newNodes[i]![newNodes[i]!.length - 1]
        nextRef = lastNode?.nextSibling ?? null
      }
    } else if (isRemote) {
      renderPortal(newChild, ctx)
      newNodes[i] = []
    } else {
      const node = renderValue(newChild, ctx)
      newNodes[i] = collectNodes(node)
      for (const n of newNodes[i]!) parent.insertBefore(n, nextRef)
      const lastNode = newNodes[i]![newNodes[i]!.length - 1]
      nextRef = lastNode?.nextSibling ?? null
    }
  }
  return newNodes
}

/**
 * 子节点逐元素浅比较（用于 componentPropsEqual 的 children 维度）
 *
 * 对 string/number 做值比较，VNode 做引用比较。
 * 只做一层，不递归（JSX 编译的 flat children 是一维数组）。
 */
function childrenEqual(a: unknown, b: unknown): boolean {
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
export function componentPropsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
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
export function propsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
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
