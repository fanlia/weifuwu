/**
 * weifuwu/ui-dom 渲染器 — VNode → DOM + patchValue diff
 *
 * render(vnode, ctx)      → 首次渲染，返回 DOM
 * patchValue(el, old, new, ctx) → 增量更新
 *
 * 支持：
 *   - key 属性（keyed diff）
 *   - ref / keyed diff
 *
 * 状态管理：组件使用闭包变量 + ctx.ui.render() 手动触发重渲染。
 */

import { Fragment, Portal, isPortal, h } from './vnode.ts'
import type { VNode, VNodeChild, Component } from './vnode.ts'
import type { UiInternal } from './ui.ts'
import type { WfuiContext } from './types.ts'
import type { BrowserEnv } from './types.ts'
import { createClientBrowser } from './browser.ts'
import { getRegistry, nextComponentIdFor, safeCallRef } from './registry.ts'
import { uiDebugEnabled, uiLog, pushDepth, popDepth } from './debug.ts'
// ⚠️ 与 diff.ts 的环：renderValue（本文件）↔ patchKeyedChildren（diff.ts）互相需要。
// 安全原因：两模块顶层仅常量声明，全部函数级延迟调用（渲染运行时两模块均已加载）。
import { patchProps, normalize, ensureKeys, patchKeyedChildren, mapChildDomNodes, componentPropsEqual } from './diff.ts'

const clientBrowser = createClientBrowser()
export const SVG_NS = 'http://www.w3.org/2000/svg'
export const SVG_TAGS = new Set(['svg', 'path', 'circle', 'line', 'rect', 'text', 'g', 'polyline', 'polygon', 'ellipse', 'defs', 'use', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'tspan'])

// ── render ─────────────────────────────────────────────

export function render(input: VNodeChild, ctx: WfuiContext): Node | null {
  const b = (ctx.browser ?? clientBrowser) as BrowserEnv
  return renderValue(input, ctx)
}

export function renderValue(v: VNodeChild, ctx: WfuiContext): Node | null {
  const b = (ctx.browser ?? clientBrowser) as BrowserEnv
  if (uiDebugEnabled()) {
    const vt = v != null && typeof v === 'object' ? (v as any).type?.name ?? String((v as any).type).slice(0, 20) : typeof v
    uiLog('renderValue', 'type=' + vt, { depth: pushDepth() })
  }
  if (v == null || typeof v === 'boolean') { if (uiDebugEnabled()) popDepth(); return null }
  if (typeof v === 'string' || typeof v === 'number') { if (uiDebugEnabled()) popDepth(); return b.createTextNode(String(v)) }
  if (Array.isArray(v)) { const r = renderArray(v, ctx); if (uiDebugEnabled()) popDepth(); return r }

  const vnode = v as VNode

  // Portal — 渲染到 document.body#__wf_portal
  if (vnode.type === Portal) {
    renderPortal(vnode, ctx)
    return null
  }

  // Fragment
  if (vnode.type === Fragment) {
    const frag = b.createDocumentFragment() as DocumentFragment
    const children = vnode.props?.children == null ? [] : (Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children])
    for (const child of children) {
      if (child && typeof child === 'object' && !Array.isArray(child)) (child as VNode)._parentVNode = vnode
      const node = renderValue(child, ctx)
      if (node != null) frag.appendChild(node)
    }
    // 记录 Fragment 实际产生的 DOM 节点（DocumentFragment 插入父节点后会展开成多个直属节点）
    // diff 用 `_childNodes` 做精确范围对齐——否则父级按位置索引 `parent.childNodes[i]` 会串位
    ;(vnode as VNode)._childNodes = Array.from(frag.childNodes)
    return frag
  }

  // Component（同步组件或 async 工厂）
  if (typeof vnode.type === 'function') {
    return renderComponent(vnode.type as Component, vnode.props, vnode, ctx)
  }

  // Native element（SVG 元素必须用 createElementNS）
  const tag = vnode.type as string
  const el = SVG_TAGS.has(tag)
    ? b.createElementNS(SVG_NS, tag)
    : b.createElement(tag as keyof HTMLElementTagNameMap)
  if (!el) return null
  vnode.el = el as Element

  // 先设非 value 属性
  let selectValue: any
  for (const [key, value] of Object.entries(vnode.props ?? {})) {
    if (key === 'children' || key === 'key' || key === 'value' || key === 'innerHTML') continue
    setProp(el, key, value)
  }
  if ('value' in (vnode.props ?? {}) && el instanceof HTMLSelectElement) {
    selectValue = vnode.props!.value
  } else if ('value' in (vnode.props ?? {})) {
    setProp(el, 'value', vnode.props!.value)
  }

    // innerHTML 优先：跳过 children 渲染
  if ('innerHTML' in (vnode.props ?? {})) {
    el.innerHTML = String(vnode.props!.innerHTML ?? '')
  } else {
    // children（select 的 options 必须先生成再设 value）
    const flatChildren = flattenChildren(vnode.props?.children)
    for (const child of flatChildren) {
      // 父 vnode 引用（新增子树 renderValue 路径——列表容器新增时整体渲染，
      // 与 patchChildren 的 diff 路径对齐；动态挂载补全靠 _parentVNode 链找持有组件）
      if (child && typeof child === 'object' && !Array.isArray(child)) (child as VNode)._parentVNode = vnode
      const childNode = renderValue(child, ctx)
      if (childNode == null) continue
      el.appendChild(childNode)
      // 首次渲染后为子组件 VNode 设置 DOM 锚点（供 scope render 使用）
      if (child && typeof child === 'object' && typeof (child as VNode).type === 'function') {
        const childVNode = child as VNode
        if (!childVNode._parentNode) {
          childVNode._parentNode = el
          childVNode._refNode = childNode
        }
      }
    }
  }

  // select value 在 options 生成后设置
  if (selectValue !== undefined) {
    ;(el as HTMLSelectElement).value = String(selectValue)
  }

  // ref 回调：ref(el) 初始化，元素移除时 ref(null) 清理（safeCallRef 防用户逻辑抛错中断渲染）
  if (typeof vnode.props?.ref === 'function') safeCallRef(vnode.props.ref, el, 'mount', tag)

  return el
}

/**
 * 异步组件工厂缓存：同一工厂只执行一次，多实例/多渲染共享。
 * resolved 记录已解析的定义（同步快速路径用）。
 * （缓存本体在 registry.ts，本文件仅保留依赖 render 的调度函数）
 */

/**
 * 动态挂载补全：运行时首次挂载的 async 组件 resolve 后，触发**父组件**重渲染。
 * 占位概念已取消（动态挂载占位 = null，无注释锚点）——resolve 后单组件 renderByIds
 * 无法定位（无 DOM 锚点）；父级重渲染 → 新树（组件已 resolve，_render 设）→ 数组 diff
 * 的 next 兄弟定位插入正确位置。
 *
 * 父组件 id 从 ctx.ui 原型链推导：动态挂载时 childCtx.ui = Object.create(父ui)，
 * 原型链上第一个 _selfId 即父组件。
 */
function scheduleLocalRefresh(vnode: VNode, ctx: WfuiContext): void {
  const id = vnode._id
  if (!id) return
  const ui = ctx.ui as (WfuiContext['ui'] & UiInternal) | undefined
  if (!ui || typeof ui.render !== 'function') return
  // 占位概念已取消（无 DOM 锚点）——补全靠**持有组件**重渲染（_parentVNode 链向上找最近组件），
  // 新树 diff 的数组 next 定位插入正确位置。自身（占位组件）renderByIds 无锚点定位不了。
  let cur: VNode | undefined = vnode._parentVNode
  let chain = 0
  while (cur && !cur._id && chain < 10) { cur = cur._parentVNode; chain++ }
  const target = cur?._id ?? id
  if ((globalThis as any).__wf_dbg) console.log('[refresh]', id, '→ target:', target, 'parentChain:', chain, 'parentType:', (cur as any)?.type?.name ?? (cur as any)?.type)
  ui.render([target])
}

/**
 * 同步 mount 组件（动态挂载兑底——buildVNode 已解析的组件不走此路径）：
 *   - 已解析（_render 已设）→ 直接渲染
 *   - async 工厂 → 同步调用（执行到第一个 await，数据请求在飞）→ 返回 null 占位；
 *     resolve 后设 _render + 局部补全（renderByIds([id])）
 *   - 同步工厂 → 返回 render fn 输出
 */
export function mountComponent(
  Comp: Component,
  props: VNode['props'],
  vnode: VNode,
  ctx: WfuiContext,
): VNode | null {
  if (uiDebugEnabled()) {
    const name = (Comp as any)?.name ?? (typeof Comp === 'function' ? 'fn' : String(typeof Comp))
    uiLog('mountComponent', name + ' id=' + String((vnode as any).id ?? '').slice(0, 10))
  }
  // failsafe：单次渲染管线挂载超限 = 无限递归（渲染死循环）——抛错拿堆栈
  const g = globalThis as any
  if (g.__wf_mountCount === undefined) g.__wf_mountCount = 0
  if (++g.__wf_mountCount > 500) {
    g.__wf_mountCount = 0
    throw new Error('[wf-render] mountComponent 超过 500 次——渲染死循环（无限挂载）')
  }
  const b = (ctx.browser ?? clientBrowser) as BrowserEnv
  // 已解析（buildVNode 预构建 或 补全后）：直接渲染，不重跑工厂
  if (typeof vnode._render === 'function') return vnode._render(props)
  // 首次调用组件（mount）：setMounting 保护期 $ 初始化赋值不触发渲染；
  // 统一签名：所有组件工厂都是 async（返回 Promise）——同步执行到第一个 await（数据请求已在飞）
  ;(ctx.ui as (WfuiContext['ui'] & UiInternal) | undefined)?.setMounting?.(true)
  let result: unknown
  try {
    result = (Comp as Component)(props, ctx)
  } finally {
    ;(ctx.ui as (WfuiContext['ui'] & UiInternal) | undefined)?.endMounting?.()
  }
  // 统一 async 工厂：占位；resolve 后局部补全（同步组件已不支持——类型系统强制 async）
  const promise = result as Promise<(props: VNode['props']) => VNode | null>
  vnode._asyncDef = promise // 占位标记（renderComponent 据此输出注释锚点）
  void promise.then(
    (defFn: any) => {
      if (typeof defFn !== 'function') {
        console.error(
          `Component ${Comp.name || 'anonymous'} async factory must return a render function. ` +
            `(props) => VNode pattern.`
        )
        return
      }
      vnode._render = defFn
      scheduleLocalRefresh(vnode, ctx)
    },
    () => {
      // 工厂失败：保持占位（已知裁剪：reject 无错误 UI/重试——见 components-cuts.md）
    },
  )
  return null // 占位（renderComponent 特判输出注释节点作锚点）
}

function renderComponent(
  Comp: Component,
  props: VNode['props'],
  vnode: VNode,
  ctx: WfuiContext,
): Node | null {
  const b = (ctx.browser ?? clientBrowser) as BrowserEnv
  // ctx.ui 由 createApp 注入（类型必需字段）——此处不补默认（原 ?? {} 是历史防御，
  // 组件渲染必然在 createApp.mount 之后）

  // 生成组件实例 ID
  if (!vnode._id) {
    const reg = getRegistry(ctx)
    vnode._id = nextComponentIdFor(reg)
    reg.idRegistry.set(vnode._id, vnode)
  }

  // 扩展 ctx：每个组件有自己的 _selfId 和 VNode 引用
  const childCtx = Object.create(ctx) as WfuiContext
  childCtx.ui = Object.create(ctx.ui) as WfuiContext['ui'] & UiInternal
  const childUi = childCtx.ui as WfuiContext['ui'] & UiInternal
  childUi._selfId = vnode._id
  childUi._selfVNode = vnode

  // 首次渲染记录当前 ctx 版本（供后续三态 skip 使用）
  vnode._ctxVersion = childUi._ctxVersion ?? 0

  let childVNode: VNode | VNode[] | null
  try {
    // buildVNode 已解析（_child 预构建）→ 直接渲染；否则动态挂载（mountComponent）
    childVNode = vnode._child != null
      ? (vnode._child as VNode | VNode[] | null)
      // 占位/resolve 残留（_asyncDef 存在）：走 mount（resolve 后 _render 已设 → 渲染插入）
      : vnode._asyncDef
        ? mountComponent(Comp, props, vnode, childCtx)
        // 常规 null 输出组件（_child 已构建为 null——Modal open=false）：复用 null 不重渲染
        : vnode._child !== undefined
          ? null
          : mountComponent(Comp, props, vnode, childCtx)
  } catch (e) {
    const errHandler = (ctx.ui as (WfuiContext['ui'] & UiInternal) | undefined)?._errorHandler
    if (errHandler) {
      errHandler(e)
      childVNode = null
    } else {
      console.error(
        `[weifuwu] Component render error in <${Comp.name || 'anonymous'}> (id: ${vnode._id ?? '?'}, phase: mount)`,
        e,
      )
      childVNode = null
    }
  }

  if (childVNode == null) {
    vnode._child = null
    // 占位概念已取消（模式 A：主路径 buildVNode await 全部；动态挂载占位 = null，
    // resolve 后由父级重渲染 diff 插入——无注释锚点/无残留）。
    // 错误边界（ErrorBoundary）输出 null 同样返回 null——错误恢复走父级重渲染。
    return null
  }
  vnode._child = childVNode
  if (childVNode && typeof childVNode === 'object' && !Array.isArray(childVNode)) childVNode._parentVNode = vnode
  const domNode = renderValue(childVNode, childCtx)
  // 为组件 VNode 设置 DOM 锚点，供 scope render 使用
  // 如果组件被原生元素包裹，原生元素路径会覆盖 _parentNode
  // 如果组件被另一个组件返回（如 RouteView → Dashboard），这里确保锚点可用
  if (!vnode._refNode) {
    vnode._refNode = domNode
  }
  return domNode
}

function renderArray(arr: VNodeChild[], ctx: WfuiContext): DocumentFragment {
  const b = (ctx.browser ?? clientBrowser) as BrowserEnv
  const frag = b.createDocumentFragment() as DocumentFragment
  for (const item of arr) {
    const node = renderValue(item, ctx)
    if (node != null) frag.appendChild(node)
  }
  return frag
}

// ── Portal ────────────────────────────────────────────

/** 获取/创建全局 Portal 容器（document.body 下） */
function ensurePortalContainer(): HTMLDivElement {
  const b = clientBrowser as BrowserEnv
  let c = b.byId('__wf_portal') as HTMLDivElement | null
  if (!c) {
    c = b.createElement('div') as HTMLDivElement
    if (!c) throw new Error('[ui-dom] portal container creation failed')
    c.id = '__wf_portal'
    c.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999'
    b.bodyAppend(c)
  }
  return c
}

/** 首次渲染 Portal：创建远程容器、渲染子节点（不返回占位节点） */
export function renderPortal(vnode: VNode, ctx: WfuiContext): void {
  const b = (ctx.browser ?? clientBrowser) as BrowserEnv
  const container = ensurePortalContainer()
  const sub = b.createElement('div') as HTMLDivElement
  sub.style.pointerEvents = 'auto'
  container.appendChild(sub)
  vnode._remoteEl = sub

  const children = normalize(vnode.props?.children)
  // Portal 子项在渲染后均为 VNode（normalize 展平数组/文本）；_child 需 VNode[]
  vnode._child = children as VNode[]
  for (const child of children) {
    const node = renderValue(child, ctx)
    if (node != null) sub.appendChild(node)
  }
}

/** 更新 Portal：复用远程容器，patch 子节点（不操作父 DOM） */
export function patchPortal(oldV: VNode | null, newV: VNode, ctx: WfuiContext): void {
  const b = (ctx.browser ?? clientBrowser) as BrowserEnv
  const sub = oldV?._remoteEl
  newV._remoteEl = sub
  if (!sub) { renderPortal(newV, ctx); return }

  const newChildren = normalize(newV.props?.children)
  const oldChildren = (oldV._child || []) as VNode[]
  newV._child = newChildren as VNode[]

  ensureKeys(oldChildren, newChildren)
  // 节点范围映射：Portal 子项含 Fragment 时产生多个 DOM 节点，需按实际范围对齐
  const oldNodes = mapChildDomNodes(Array.from(sub.childNodes), oldChildren)
  patchKeyedChildren(sub, oldChildren, newChildren, ctx, oldNodes, oldNodes[0]?.[0] ?? null)
}

function forEach(children: VNodeChild, fn: (child: VNodeChild) => void) {
  if (children == null) return
  if (Array.isArray(children)) { children.forEach(fn); return }
  fn(children)
}

/** 展平嵌套数组 */
export function flattenChildren(children: VNodeChild): VNodeChild[] {
  if (children == null) return []
  if (!Array.isArray(children)) return [children]
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

// ── setProp ────────────────────────────────────────────

function setProp(el: Element, key: string, value: any) {
  // ref 是特殊 prop：renderValue 中作为函数调用（ref(el)/ref(null)）——
  // 不落 DOM 属性（否则 setAttribute('ref', String(fn)) 污染 DOM）
  if (key === 'ref') return
  if (key === 'class' || key === 'className') {
    // SVG use setAttribute('class'), HTML use className property
    if (el instanceof SVGElement) el.setAttribute('class', String(value ?? ''))
    else el.className = String(value ?? '')
  } else if (key === 'style' && typeof value === 'object' && value !== null) {
    const st = (el as HTMLElement).style
    for (const sk of Object.keys(value)) {
      const sv = value[sk]
      if (sv == null) continue
      // CSS 变量必须 setProperty（st['--x']=v 静默失败——
      // --wf-cols/--wf-split-ratio 曾不生效）；数值保持字符串（不转 px）
      if (sk.startsWith('--')) st.setProperty(sk, String(sv))
      // 普通 camelCase 键走索引赋值（setProperty 需 kebab-case，camelCase 如 fontSize 会失效）；数值转 px
      else (st as unknown as Record<string, string>)[sk] = typeof sv === 'number' ? sv + 'px' : String(sv)
    }
  } else if (key.startsWith('on') && typeof value === 'function') {
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
  } else if (key === 'draggable') {
    // draggable 是 enumerated 属性（非 boolean）——setAttribute('draggable', '')
    // 空字符串解析为 false——必须显式 'true'/'false'
    el.setAttribute('draggable', value ? 'true' : 'false')
  } else if (key.startsWith('aria-') && typeof value === 'boolean') {
    // aria-* 是枚举语义属性（同 draggable）：aria-expanded="" 解析为非标准值——
    // boolean 必须显式 'true'/'false' 字符串（ReasoningBlock CDD 暴露）
    el.setAttribute(key, value ? 'true' : 'false')
  } else if (key === 'value' && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
    ;(el as HTMLSelectElement).value = String(value ?? '')
  } else if (value === true) {
    el.setAttribute(key, '')
  } else if (value != null && value !== false) {
    el.setAttribute(key, String(value))
  }
}

// ── 内联 ref 检测 ────────────────────────────────────
// ref-diff 在 ref 函数引用变化时调用旧 ref(null)（见 patchValue）。
// 内联 ref（render 里写 `ref: (el) => {...}`）每次渲染都是新函数 → 每渲染触发一次
// ref(null)+ref(el)，清理逻辑被反复执行而非仅在卸载时。同一元素变化 ≥3 次才警告
// （放过合法的单次/偶发替换，抓住每次渲染都变的内联反模式）。
// ── 清理 ────────────────────────────────────────────

// （ref 清理逻辑已移至 registry.ts：callRefCleanup / cleanupPortalChildren）

// ── 挂载到容器 ────────────────────────────────────────

/** 挂载 VNode 树到容器（async：await buildVNode 预构建——统一 async 组件签名） */
export async function mountVNode(container: Element, vnode: VNode, ctx: WfuiContext) {
  container.innerHTML = ''
  await buildVNode(vnode, ctx)
  const node = renderValue(vnode, ctx)
  // renderValue 返回 Node | null——数组分支不可达（CS-01 死代码），直接插入
  if (node instanceof Node) container.appendChild(node)
}

// ── buildVNode（模式 A：async 预构建） ──────────────────

/**
 * 共享的 async 组件挂载辅助（S4 三遍历器合一——buildVNode/hydration 共用）：
 * 同一套「id 分配 + childCtx 构造（ui 扩展 + _selfId/_selfVNode/_ctxVersion）+ 工厂调用
 * （setMounting 保护期 $ 初始化不污染 dirtySet + renderFn 校验）」——单一事实源。
 *
 * - opts.reuse：旧树同位置同类型组件复用 _render（工厂不重跑，保持内部状态——buildVNode 导航场景）
 * - 返回 { renderFn, childCtx }：调用方用 childCtx 递归子树
 *
 * renderSsr 不使用本辅助（per-request 无状态遍历——不分配 id/不设 _render，本质不同）。
 */
export async function mountAsyncComponent(
  vnode: VNode,
  ctx: WfuiContext,
  opts?: { reuse?: VNode },
): Promise<{ renderFn: (props: VNode['props']) => VNode | null; childCtx: WfuiContext }> {
  if (!vnode._id) {
    const reg = getRegistry(ctx)
    vnode._id = nextComponentIdFor(reg)
    reg.idRegistry.set(vnode._id, vnode)
  }
  const childCtx = Object.create(ctx) as WfuiContext
  childCtx.ui = Object.create(ctx.ui) as WfuiContext['ui'] & UiInternal
  const childUi = childCtx.ui as WfuiContext['ui'] & UiInternal
  childUi._selfId = vnode._id
  childUi._selfVNode = vnode
  vnode._ctxVersion = childUi._ctxVersion ?? 0
  // 旧树同位置同类型复用（工厂不重跑——组件跨渲染保持内部状态：$ / let / useStableRef）
  if (typeof vnode._render !== 'function' && typeof opts?.reuse?._render === 'function') {
    vnode._render = opts.reuse._render
  }
  if (typeof vnode._render !== 'function') {
    // mount 保护期：$ 初始化赋值不产生 dirty 标记（否则污染 dirtySet → 破坏后续三态 skip 的
    // dirty 判定——debug-skip 事故：首帧 $.n=0 赋值 → 导航时 skipDirty=false → renderFn 重跑）
    ;(ctx.ui as (WfuiContext['ui'] & UiInternal) | undefined)?.setMounting?.(true)
    let renderFn: unknown
    try {
      renderFn = await (vnode.type as Component)(vnode.props ?? {}, childCtx)
    } finally {
      ;(ctx.ui as (WfuiContext['ui'] & UiInternal) | undefined)?.endMounting?.()
    }
    if (typeof renderFn !== 'function') {
      throw new Error(
        `Component ${(vnode.type as any).name || 'anonymous'} must return a render function. ` +
          `Use (init_props, ctx) => (props) => VNode pattern.`
      )
    }
    vnode._render = renderFn as (props: VNode['props']) => VNode | null
  }
  return { renderFn: vnode._render as (props: VNode['props']) => VNode | null, childCtx }
}

/**
 * 递归展开组件树（async）：await 工厂 → renderFn → 递归子树。**零 DOM**。
 *
 * - 组件节点保留在树上（挂 `_render` + `_child`）——`$` dirty 精准刷新锚点不丢
 * - 兄弟组件 Promise.all 并行（工厂同步执行到第一个 await，数据请求在飞）
 * - **旧树对照**（oldInput）：同位置同类型组件复用旧 `_render`（工厂不重跑）——
 *   组件跨渲染保持内部状态（$ / let / useStableRef）——与 diff 的 _render 传递同语义，
 *   只是提前到构建期（否则导航每次重跑工厂，useStableRef 测试暴露）
 * - 原地 mutate vnode（_render/_child）——引用保持，diff 三态 skip 不受影响
 *
 * 返回后可：renderValue（DOM 落地）或 patchValue（导航 diff）——两次调用间工厂只跑一次。
 */
export async function buildVNode(input: VNodeChild, ctx: WfuiContext, oldInput?: VNodeChild): Promise<VNodeChild> {
  if (input == null || typeof input === 'boolean' || typeof input === 'string' || typeof input === 'number') {
    return input
  }
  if (Array.isArray(input)) {
    // 兄弟并行：所有子树同时启动（async 组件工厂同步执行到第一个 await 后并发等待）
    const oldArr = Array.isArray(oldInput) ? oldInput : []
    await Promise.all(input.map((c, i) => buildVNode(c, ctx, oldArr[i])))
    return input
  }
  const vnode = input as VNode
  const oldV = (oldInput != null && typeof oldInput === 'object' && !Array.isArray(oldInput) && (oldInput as VNode).type === vnode.type)
    ? (oldInput as VNode)
    : null
  // 组件：await 工厂 → renderFn → 递归子树（组件节点保留，挂 _render/_child）
  if (typeof vnode.type === 'function') {
    const { childCtx } = await mountAsyncComponent(vnode, ctx, { reuse: oldV ?? undefined })
    // 渲染 _child：仅当无旧 _child 可复用 或 props 已变（diff 必非 skip——需要预构建子树）。
    // 同 props + 有旧 _child → 跳过渲染（三态 skip 语义前置：diff skip 复用旧 _child，
    // renderFn 不重跑——否则导航/重渲染每次重跑 renderFn 绕过 skip，ui-dom-regression 暴露）
    const propsSame = componentPropsEqual(oldV?.props ?? {}, vnode.props ?? {})
    if (!propsSame || oldV?._child == null) {
      vnode._child = (await buildVNode(vnode._render!(vnode.props ?? {}), childCtx, oldV?._child ?? undefined)) as VNode | null | VNode[]
    }
    return vnode
  }
  // native / Fragment / Portal：递归 children（组件可能在 children 深处）
  if (vnode.props?.children != null) {
    await buildVNode(vnode.props.children, childCtxOf(ctx), oldV?.props?.children)
  }
  return vnode
}

/** buildVNode 的 native 子树 ctx（无组件上下文扩展——渲染器在 renderValue 时扩展） */
function childCtxOf(ctx: WfuiContext): WfuiContext {
  return ctx
}

// ── 兼容导出（diff 逻辑在 diff.ts） ──
export { patchValue } from './diff.ts'

// ── 兼容导出（components 迁移——callRefCleanup 无 ctx 场景回退新实例） ──
import { callRefCleanupFor, createRegistry } from './registry.ts'
/** 模块级兼容（无 ctx 场景——独立清理，不影响活跃 registry） */
export function callRefCleanup(input: any): void {
  callRefCleanupFor(input, createRegistry())
}
