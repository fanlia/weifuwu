/**
 * vdom3 router — 路由（location → ROUTE_CHANGE 事件 → 组件挂载 → DOM 全链路）
 *
 * 事件流覆盖：ROUTE_CHANGE(path, params) → COMP_MOUNT → NODE_CREATE/INSERT → ...
 * 页面切换 = 异类型 patch（旧页面 COMP_UNMOUNT + REMOVE；新页面 MOUNT + CREATE/INSERT）——
 * 全链路事件化（location→DOM 的完整因果链可回放）。
 */

import type { VNode } from './types.ts'
import { buildVNode } from './build.ts'
import { mount, patch } from './render.ts'
import { stream } from './events.ts'

export interface RouteDef {
  path: string
  /** 页面渲染（params 注入——:id 等） */
  render: (params: Record<string, string>) => VNode
}

export interface RouterHandle {
  navigate(path: string): void
  /** 当前路径 */
  path(): string
  /** 立即处理当前 URL（测试/恢复） */
  refresh(): void
  close(): void
}

function compilePath(path: string): { re: RegExp; keys: string[] } {
  const keys: string[] = []
  const reStr = String(path)
    .replace(/:(\w+)/g, (_, k: string) => { keys.push(k); return '([^/]+)' })
    .replace(/\*/g, '.*')
  return { re: new RegExp(`^${reStr}$`), keys }
}

function match(routes: RouteDef[], path: string): { def: RouteDef; params: Record<string, string> } | null {
  for (const def of routes) {
    const { re, keys } = compilePath(def.path)
    const m = path.match(re)
    if (!m) continue
    const params: Record<string, string> = {}
    for (let i = 0; i < keys.length; i++) params[keys[i]] = decodeURIComponent(m[i + 1])
    return { def, params }
  }
  return null
}

/** 创建路由应用（初始挂载 + popstate 导航） */
export function createRouter(routes: RouteDef[], root: HTMLElement, options?: { initialPath?: string }): RouterHandle {
  let current: VNode | null = null
  let pageVnode: VNode | null = null // 当前页面组件 vnode（组件引用——重渲染定位）
  let busy = false
  type Op = { type: 'nav'; path: string } | { type: 'refresh' }
  let queue: Op | null = null

  // 页面组件 ctx：render = 重渲染当前页（组件工厂收到——交互驱动）
  let pageCtx: Record<string, unknown> = {}
  const makePageCtx = (): Record<string, unknown> => ({
    render: () => { void updatePage() },
  })

  /** 重渲染当前页面（页面组件 ctx.render——组件实例复用 + patch） */
  async function updatePage(): Promise<void> {
    if (busy) { queue = { type: 'refresh' }; return } // 与导航串行（渲染中触发 → 排队）
    if (!current || !pageVnode) return
    busy = true
    try {
      const v = pageVnode
      if (typeof v.type === 'function' && v._render) {
        const output = await v._render(v.props)
        if (output == null) return
        const oldOut = (v as any)._child ?? null
        const built = await buildVNode(output, pageCtx, oldOut && typeof oldOut === 'object' ? (oldOut as VNode) : null)
        ;(v as any)._child = built
        patch(oldOut as VNode | null, built, root)
      }
    } finally {
      busy = false
      if (queue != null) { const q = queue; queue = null; void runOp(q) }
    }
  }

  function runOp(op: Op): void {
    if (op.type === 'nav') void handleRoute(op.path)
    else void updatePage()
  }

  async function handleRoute(path: string): Promise<void> {
    if (busy) { queue = { type: 'nav', path }; return } // 导航串行（快速连续导航排队——防竞态）
    busy = true
    try {
      const matched = match(routes, path)
      stream.emit({ type: 'ROUTE_CHANGE', path, params: matched?.params ?? {}, ts: Date.now() })
      if (!matched) {
        root.innerHTML = '' // 无匹配 → 清空（404 由上层处理）
        current = null
        pageVnode = null
        return
      }
      pageCtx = makePageCtx() // 新页面新 ctx（render 绑定当前实例）
      const vnode = matched.def.render(matched.params)
      const built = await buildVNode(vnode, pageCtx)
      if (current == null) {
        mount(built, root) // 首帧
      } else {
        patch(current, built, root) // 页面切换（异类型 → COMP_UNMOUNT+REMOVE / MOUNT+CREATE）
      }
      current = built
      pageVnode = built
    } finally {
      busy = false
      if (queue != null) { const q = queue; queue = null; void runOp(q) }
    }
  }

  const onPopState = () => { void handleRoute(window.location.pathname) }
  window.addEventListener('popstate', onPopState)

  // 初始路由
  const initial = options?.initialPath ?? window.location.pathname
  void handleRoute(initial)

  return {
    navigate(path: string): void {
      window.history.pushState(null, '', path)
      void handleRoute(path)
    },
    path: () => window.location.pathname,
    refresh: () => { void handleRoute(window.location.pathname) },
    close: () => { window.removeEventListener('popstate', onPopState) },
  }
}
