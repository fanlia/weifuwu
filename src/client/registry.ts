/**
 * weifuwu/client 注册表 — 组件实例 ID 注册 + async 工厂缓存 + ref 清理
 *
 * 从 render.ts 拆出（P2 结构拆分）：本文件无内部依赖（仅 vnode/types），
 * render/diff/hydration/app 各模块共享同一实例状态。
 * ⚠️ 模块状态共享约束：本文件必须保持单实例（dist 消费端由 build.mjs 外部化保证）。
 */

import type { VNode, Component, AsyncComponent } from './vnode.ts'
import { isAsyncComponent } from './vnode.ts'
import type { WfuiContext } from './types.ts'

// ── 组件实例 ID 注册表 ────────────────────────────

let _idCounter = 0
export const idRegistry = new Map<string, VNode>()

// ── 卸载钩子（P3：app 层注册清理 media/popup 注册表） ──

type UnmountHook = (id: string) => void
let _unmountHooks: UnmountHook[] = []

/** 注册组件卸载钩子（组件从 idRegistry 注销时触发，含 _customId） */
export function onComponentUnmount(hook: UnmountHook): void {
  _unmountHooks.push(hook)
}

// ── async 工厂缓存（同一工厂只执行一次，多实例/多渲染共享） ──

interface FactoryEntry {
  promise: Promise<Component<any, any>>
  resolved?: Component<any, any>
}
let asyncFactoryCache = new WeakMap<AsyncComponent<any, any>, FactoryEntry>()

/**
 * 清空 async 工厂缓存。
 * 页面上下文切换时调用（路由导航/登录登出）——工厂内 ctx.data.get 的 key 依赖 ctx（如 route.params），
 * 上下文变化后旧缓存定义的数据已失效，需要让工厂以新 ctx 重新执行。
 */
export function clearAsyncComponentCache(): void {
  asyncFactoryCache = new WeakMap()
}

/** 启动 async 工厂（幂等，缓存）：返回 entry，promise resolve 后 resolved 可用 */
export function startAsyncFactory(Comp: AsyncComponent, ctx: WfuiContext): FactoryEntry {
  const existing = asyncFactoryCache.get(Comp)
  if (existing) return existing

  const entry: FactoryEntry = { promise: null as unknown as Promise<Component<any, any>> }
  entry.promise = Promise.resolve()
    .then(() => Comp(ctx))
    .then((def) => {
      if (typeof def !== 'function') {
        throw new Error(
          `asyncComponent factory <${Comp.name || 'anonymous'}> must return a Component ` +
            `(initProps, ctx) => (props) => VNode.`
        )
      }
      entry.resolved = def as Component
      return def as Component
    })
  asyncFactoryCache.set(Comp, entry)
  return entry
}

/** async 模式：await 工厂定义（初次渲染/服务端遍历/未来 hydration） */
export async function resolveAsyncFactory(Comp: AsyncComponent, ctx: WfuiContext): Promise<Component> {
  return startAsyncFactory(Comp, ctx).promise
}

/** sync 模式：工厂已解析 → 定义；未解析 → undefined（占位 + 完成后整树重渲染） */
export function resolveAsyncFactorySync(Comp: AsyncComponent): Component | undefined {
  return asyncFactoryCache.get(Comp)?.resolved
}

// ── ref 清理 ────────────────────────────────────

/** 递归清理 Portal 子内容的 ref */
function cleanupPortalChildren(vnode: VNode) {
  const child = vnode._child
  if (child == null) return
  if (Array.isArray(child)) {
    for (const c of child) {
      if (c && typeof c === 'object') callRefCleanup(c as VNode)
    }
  } else if (typeof child === 'object') {
    callRefCleanup(child as VNode)
  }
}

/** 通知 ref 清理 + Portal 子容器清理 */
export function callRefCleanup(input: any) {
  if (input == null || typeof input !== 'object') return
  const vnode = input as VNode

  // ── 组件卸载：从 idRegistry 注销并清除渲染状态 ──
  // 防止卸载后残留的异步回调（setTimeout/Promise/WS 消息等）通过
  // ctx.ui.dirty()/render() 触发死组件重渲染，把 DOM 重新插回当前页面
  if (vnode._id) {
    if (vnode._customId) idRegistry.delete(vnode._customId)
    idRegistry.delete(vnode._id)
    // 卸载通知（app 层借此清理 media/popup 注册表条目）
    if (_unmountHooks.length > 0) {
      for (const h of _unmountHooks) h(vnode._id)
      if (vnode._customId) for (const h of _unmountHooks) h(vnode._customId)
    }
    vnode._id = undefined
    vnode._customId = undefined
    vnode._render = undefined
    vnode._parentNode = undefined
    vnode._refNode = undefined
  }

  // 先递归清理 _child（支持数组——Portal 的 _child 是 `[root, ...]`）
  if (vnode._child != null) {
    if (Array.isArray(vnode._child)) {
      for (const child of vnode._child) {
        if (child && typeof child === 'object') callRefCleanup(child as VNode)
      }
    } else {
      callRefCleanup(vnode._child as VNode)
    }
    vnode._child = undefined
  }
  // 递归 props.children（寻找子组件 VNode）
  if (vnode.props?.children && typeof vnode.type === 'string') {
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
    for (const child of children) {
      if (child && typeof child === 'object') callRefCleanup(child as VNode)
    }
  }
  // 执行 ref 清理
  if (typeof vnode.props?.ref === 'function') vnode.props.ref(null)

  // Portal 子容器移除 + 子内容 ref 清理
  if (vnode._remoteEl) {
    cleanupPortalChildren(vnode)
    vnode._remoteEl.remove()
    vnode._remoteEl = undefined
  }
}

/** 供 hydration/mount 路径生成新组件 ID（保持与 idRegistry 同源递增） */
export function nextComponentId(): string {
  return `_wf_${_idCounter++}`
}
