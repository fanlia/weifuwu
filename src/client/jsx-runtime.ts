/**
 * weifuwu/client JSX runtime — TSX 编译目标
 *
 * esbuild: --jsx=automatic --jsxImportSource=weifuwu/client
 * tsconfig: "jsx": "react-jsx", "jsxImportSource": "weifuwu/client"
 *
 * createElement 直接创建真实 DOM 节点。
 * Signal 值自动绑定：.value 变化时只更新对应 DOM 节点。
 * 组件签名：(props, ctx) => JSX
 */

import { type Signal, isSignal, effect } from './signal.ts'
import type { WfuiContext } from './types.ts'

// JSX 全局类型 — 使 <div /> <span /> 等通过类型检查
declare global {
  namespace JSX {
    interface IntrinsicElements {
      [tag: string]: any
    }
  }
}

// ── ctx 上下文（渲染时注入）──────────────────────────────────

let currentCtx: WfuiContext | null = null

export function setCtx(ctx: WfuiContext | null) {
  currentCtx = ctx
}

export function getCtx(): WfuiContext | null {
  return currentCtx
}

// ── 类型 ────────────────────────────────────────────────────

export type Component<P = {}> = (props: P, ctx: WfuiContext) => Node

// ── 工具 ─────────────────────────────────────────────────────

function setProp(el: Element, key: string, value: unknown) {
  if (key === 'class' || key === 'className') {
    if (isSignal(value)) {
      effect(() => { el.className = String(value.value) })
    } else {
      el.className = String(value ?? '')
    }
  } else if (key === 'style' && typeof value === 'object' && value !== null) {
    Object.assign((el as HTMLElement).style, value)
  } else if (key.startsWith('on') && typeof value === 'function') {
    el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
  } else if (key === 'ref' && typeof value === 'function') {
    value(el)
  } else if (isSignal(value)) {
    effect(() => {
      const v = value.value
      if (v == null || v === false) el.removeAttribute(key)
      else if (v === true) el.setAttribute(key, '')
      else el.setAttribute(key, String(v))
    })
  } else if (value != null && value !== false) {
    if (value === true) el.setAttribute(key, '')
    else el.setAttribute(key, String(value))
  }
}

function appendChild(parent: Node, child: unknown) {
  if (child == null || child === false || child === true) return
  if (Array.isArray(child)) { child.forEach(c => appendChild(parent, c)); return }
  if (child instanceof Node) { parent.appendChild(child); return }
  if (isSignal(child)) {
    const text = document.createTextNode('')
    effect(() => { text.textContent = String(child.value) })
    parent.appendChild(text)
    return
  }
  parent.appendChild(document.createTextNode(String(child)))
}

// ── JSX 工厂 ─────────────────────────────────────────────────

export function jsx(
  type: string | Component,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Node {
  if (typeof type === 'function') {
    const merged = children.length > 0 ? { ...props, children } : props
    return (type as any)(merged, currentCtx) ?? document.createDocumentFragment()
  }

  const el = document.createElement(type)
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (k !== 'children') setProp(el, k, v)
    }
  }
  // children 可能在 rest 参数里（手动调用），也可能在 props.children 里（jsx:automatic）
  const childList = children.length > 0 ? children : (props?.children != null ? [props.children] : [])
  for (const child of childList) appendChild(el, child)
  return el
}

export function jsxs(
  type: string | Component,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): Node {
  return jsx(type, props, ...children)
}

export function jsxDEV(
  type: string | Component,
  props: Record<string, unknown> | null,
  _key: string | null,
  _isStatic: boolean,
  _source: { fileName: string; lineNumber: number },
  _self: unknown,
): Node {
  return jsx(type, props, ...(props?.children ? [props.children] : []))
}

export function Fragment(props: Record<string, unknown> | null, ...children: unknown[]): Node {
  const frag = document.createDocumentFragment()
  for (const child of children) appendChild(frag, child)
  return frag
}

// ── 挂载 ─────────────────────────────────────────────────────

/**
 * 直接挂载 DOM（低层 API，一般用 createApp().mount()）
 */
export function domMount(root: string | Element, app: Node): void {
  const container = typeof root === 'string' ? document.querySelector(root) : root
  if (!container) throw new Error(`mount target not found: ${root}`)
  container.innerHTML = ''
  container.appendChild(app)
}

// ── 控制流组件 ──────────────────────────────────────────────

function toNode(v: unknown): Node {
  if (v instanceof Node) return v
  if (typeof v === 'function') return toNode(v())
  return document.createTextNode(String(v ?? ''))
}

/**
 * 条件渲染 — when 为 Signal 时响应式切换
 *
 * ```tsx
 * <Show when={isLoggedIn} fallback={<LoginPage />}>
 *   <ChatPage />
 * </Show>
 * ```
 */
export function Show({ when, children, fallback }: {
  when: boolean | Signal<boolean>
  children?: Node | (() => Node)
  fallback?: Node | (() => Node)
}): Node {
  const el = document.createElement('div')

  function render(show: boolean) {
    el.textContent = ''
    if (show && children != null) {
      el.appendChild(toNode(children))
    } else if (!show && fallback != null) {
      el.appendChild(toNode(fallback))
    }
  }

  if (isSignal(when)) {
    effect(() => render(Boolean(when.value)))
  } else {
    render(Boolean(when))
  }
  return el
}

/**
 * 列表渲染 — each 为 Signal 时响应式更新
 *
 * ```tsx
 * <For each={items}>
 *   {(item) => <div>{item.name}</div>}
 * </For>
 * ```
 */
export function For<T>({ each, children }: {
  each: T[] | Signal<T[]>
  children: (item: T, index: number) => Node
}): Node {
  const el = document.createElement('div')

  function render(list: T[]) {
    el.textContent = ''
    for (let i = 0; i < list.length; i++) {
      el.appendChild(children(list[i], i))
    }
  }

  if (isSignal(each)) {
    effect(() => render(each.value))
  } else {
    render(each)
  }
  return el
}
