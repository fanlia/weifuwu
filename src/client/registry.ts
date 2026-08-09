/**
 * weifuwu/client 注册表 — 组件实例 ID 注册 + async 工厂缓存 + ref 清理
 *
 * 双形态：
 *   1. 模块级单例（createApp 默认路径——dist 消费端由 build.mjs 外部化保证）
 *   2. createRegistryState() 工厂（UIRouter 等独立运行时注入 ctx.__registry——
 *      局部状态隔离，不与 createApp 的 idRegistry 交叉命中）
 *
 * render/diff/hydration/ui 统一用 getRegistry(ctx) 取注入实例，无注入回退模块级。
 */

import type { VNode, Component, AsyncComponent } from './vnode.ts'
import { isAsyncComponent } from './vnode.ts'
import type { WfuiContext } from './types.ts'

// ── 注册表状态（可实例化） ─────────────────────────

export interface RegistryState {
  idCounter: number
  idRegistry: Map<string, VNode>
  unmountHooks: UnmountHook[]
  asyncFactoryCache: WeakMap<AsyncComponent<any, any>, FactoryEntry>
}

type UnmountHook = (id: string) => void

interface FactoryEntry {
  promise: Promise<Component<any, any>>
  resolved?: Component<any, any>
}

/** 创建局部注册表状态（UIRouter 等独立运行时用） */
export function createRegistryState(): RegistryState {
  return {
    idCounter: 0,
    idRegistry: new Map(),
    unmountHooks: [],
    asyncFactoryCache: new WeakMap(),
  }
}

/** 从 ctx 取注入的注册表；无注入回退模块级单例（createApp 兼容） */
export function getRegistry(ctx: any): RegistryState {
  return ctx?.__registry ?? globalState
}

// ── 模块级单例（createApp 路径——保持现有导出兼容） ──

const globalState = createRegistryState()

export const idRegistry = globalState.idRegistry

/**
 * 注册组件卸载钩子（组件从 idRegistry 注销时触发，含 _customId）。
 *
 * 返回退订函数——组件级钩子（use* 原语）应在触发后自退订，
 * 避免 _unmountHooks 数组随 mount 累积导致长期 SPA 内存增长 + unmount O(n) 退化。
 * app 生命周期级钩子（app.mount 注册的 media/popup/scroll 清理）不退订（随 app 消亡）。
 */
export function onComponentUnmount(hook: UnmountHook): () => void {
  return onComponentUnmountFor(globalState, hook)
}

/** 指定 registry 实例注册卸载钩子（UIRouter 隔离路径） */
export function onComponentUnmountFor(state: RegistryState, hook: UnmountHook): () => void {
  state.unmountHooks.push(hook)
  return () => {
    const i = state.unmountHooks.indexOf(hook)
    if (i >= 0) state.unmountHooks.splice(i, 1)
  }
}

/** test-only：返回当前注册的卸载钩子数（回归护栏——验证组件级钩子自退订不累积） */
export function __testHookCount(): number {
  return globalState.unmountHooks.length
}

/**
 * 清空 async 工厂缓存。
 * 页面上下文切换时调用（路由导航/登录登出）——工厂内 ctx.data.get 的 key 依赖 ctx（如 route.params），
 * 上下文变化后旧缓存定义的数据已失效，需要让工厂以新 ctx 重新执行。
 */
export function clearAsyncComponentCache(): void {
  globalState.asyncFactoryCache = new WeakMap()
}

/** 启动 async 工厂（幂等，缓存）：返回 entry，promise resolve 后 resolved 可用 */
export function startAsyncFactory(Comp: AsyncComponent, ctx: WfuiContext): FactoryEntry {
  const state = getRegistry(ctx)
  const existing = state.asyncFactoryCache.get(Comp)
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
  state.asyncFactoryCache.set(Comp, entry)
  return entry
}

/** async 模式：await 工厂定义（初次渲染/服务端遍历/未来 hydration） */
export async function resolveAsyncFactory(Comp: AsyncComponent, ctx: WfuiContext): Promise<Component> {
  return startAsyncFactory(Comp, ctx).promise
}

/** sync 模式：工厂已解析 → 定义；未解析 → undefined（占位 + 完成后整树重渲染） */
export function resolveAsyncFactorySync(Comp: AsyncComponent, ctx?: any): Component | undefined {
  const state = ctx ? getRegistry(ctx) : globalState
  return state.asyncFactoryCache.get(Comp)?.resolved
}

// ── ref 安全调用 ────────────────────────────────

/**
 * 包裹 ref 回调调用——用户 ref 逻辑抛错时不中断渲染/卸载管线。
 *
 * ref 在渲染期外执行（mount 后/卸载时），语义上属用户逻辑 bug，不接 _errorHandler
 * （ErrorBoundary 只覆盖渲染期错误）。console.error 暴露问题即可。
 */
export function safeCallRef(
  ref: Function,
  arg: any,
  phase: 'mount' | 'cleanup',
  name?: string,
): void {
  try {
    ref(arg)
  } catch (e) {
    console.error(
      `[weifuwu] ref ${phase} error in <${name ?? 'anonymous'}>`,
      e,
    )
  }
}

// ── ref 清理 ────────────────────────────────────

/** 递归清理 Portal 子内容的 ref（指定 registry） */
function cleanupPortalChildren(vnode: VNode, state: RegistryState) {
  const child = vnode._child
  if (child == null) return
  if (Array.isArray(child)) {
    for (const c of child) {
      if (c && typeof c === 'object') callRefCleanupFor(c as VNode, state)
    }
  } else if (typeof child === 'object') {
    callRefCleanupFor(child as VNode, state)
  }
}

/** 通知 ref 清理 + Portal 子容器清理（指定 registry 实例） */
export function callRefCleanupFor(input: any, state: RegistryState): void {
  if (input == null || typeof input !== 'object') return
  const vnode = input as VNode

  // ── 组件卸载：从 idRegistry 注销并清除渲染状态 ──
  // 防止卸载后残留的异步回调（setTimeout/Promise/WS 消息等）通过
  // ctx.ui.dirty()/render() 触发死组件重渲染，把 DOM 重新插回当前页面
  if (vnode._id) {
    if (vnode._customId) state.idRegistry.delete(vnode._customId)
    state.idRegistry.delete(vnode._id)
    // 卸载通知（app 层借此清理 media/popup 注册表条目）
    // 快照遍历——钩子内可能自退订（splice 修改数组），防迭代错位
    if (state.unmountHooks.length > 0) {
      const hooks = [...state.unmountHooks]
      for (const h of hooks) h(vnode._id)
      if (vnode._customId) for (const h of hooks) h(vnode._customId)
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
        if (child && typeof child === 'object') callRefCleanupFor(child as VNode, state)
      }
    } else {
      callRefCleanupFor(vnode._child as VNode, state)
    }
    vnode._child = undefined
  }
  // 递归 props.children（寻找子组件 VNode）
  if (vnode.props?.children && typeof vnode.type === 'string') {
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
    for (const child of children) {
      if (child && typeof child === 'object') callRefCleanupFor(child as VNode, state)
    }
  }
  // 执行 ref 清理（safeCallRef 防用户逻辑抛错中断递归）
  if (typeof vnode.props?.ref === 'function') safeCallRef(vnode.props.ref, null, 'cleanup')

  // Portal 子容器移除 + 子内容 ref 清理
  if (vnode._remoteEl) {
    cleanupPortalChildren(vnode, state)
    vnode._remoteEl.remove()
    vnode._remoteEl = undefined
  }
}

/** 通知 ref 清理（模块级默认路径——createApp 兼容） */
export function callRefCleanup(input: any): void {
  callRefCleanupFor(input, globalState)
}

/** 供 hydration/mount 路径生成新组件 ID（模块级默认——createApp 兼容） */
export function nextComponentId(): string {
  return `_wf_${globalState.idCounter++}`
}

/** 供 hydration/mount 路径生成新组件 ID（指定 registry 实例） */
export function nextComponentIdFor(state: RegistryState): string {
  return `_wf_${state.idCounter++}`
}
