/**
 * weifuwu/ui-dom 注册表 — 工厂版（serve 创建局部实例，隔离于 createApp 的模块级状态）
 *
 * 复制自 client/registry.ts（算法相同），但**无模块级单例**——uiServe 创建实例
 * 注入 ctx.__registry，render/diff/ui 经 getRegistry(ctx) 读取，与 createApp 零交叉。
 */

import type { VNode, Component, AsyncComponent } from './vnode.ts'
import { isAsyncComponent } from './vnode.ts'
import type { WfuiContext } from './types.ts'

type UnmountHook = (id: string) => void

interface FactoryEntry {
  promise: Promise<Component<any, any>>
  resolved?: Component<any, any>
}

/** 注册表实例状态 */
export interface Registry {
  idCounter: number
  idRegistry: Map<string, VNode>
  unmountHooks: UnmountHook[]
  asyncFactoryCache: WeakMap<AsyncComponent<any, any>, FactoryEntry>
}

/** 创建局部注册表（uiServe 每实例一个——组件 id/dirty/卸载钩子与 createApp 隔离） */
export function createRegistry(): Registry {
  return {
    idCounter: 0,
    idRegistry: new Map(),
    unmountHooks: [],
    asyncFactoryCache: new WeakMap(),
  }
}

/** 从 ctx 取注入的注册表（render/diff/ui 统一入口；serve 注入 __registry） */
export function getRegistry(ctx: any): Registry {
  return ctx?.__registry ?? createRegistry()
}

/** 指定实例生成组件 ID */
export function nextComponentIdFor(reg: Registry): string {
  return `_wf_${reg.idCounter++}`
}

/** 指定实例注册卸载钩子（组件从 idRegistry 注销时触发） */
export function onComponentUnmountFor(reg: Registry, hook: UnmountHook): () => void {
  reg.unmountHooks.push(hook)
  return () => {
    const i = reg.unmountHooks.indexOf(hook)
    if (i >= 0) reg.unmountHooks.splice(i, 1)
  }
}

// ── async 工厂缓存（复制自 client——局部实例） ──

/** 启动 async 工厂（幂等，缓存） */
export function startAsyncFactory(reg: Registry, Comp: AsyncComponent, ctx: WfuiContext): FactoryEntry {
  const existing = reg.asyncFactoryCache.get(Comp)
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
  reg.asyncFactoryCache.set(Comp, entry)
  return entry
}

/** async 模式：await 工厂定义 */
export async function resolveAsyncFactory(reg: Registry, Comp: AsyncComponent, ctx: WfuiContext): Promise<Component> {
  return startAsyncFactory(reg, Comp, ctx).promise
}

/** sync 模式：工厂已解析 → 定义；未解析 → undefined */
export function resolveAsyncFactorySync(reg: Registry, Comp: AsyncComponent): Component | undefined {
  return reg.asyncFactoryCache.get(Comp)?.resolved
}

// ── ref 安全调用（复制自 client） ──

/** 包裹 ref 回调调用——用户 ref 逻辑抛错时不中断渲染/卸载管线 */
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

// ── ref 清理（复制自 client——指定实例） ──

/** 递归清理 Portal 子内容的 ref */
function cleanupPortalChildren(vnode: VNode, reg: Registry) {
  const child = vnode._child
  if (child == null) return
  if (Array.isArray(child)) {
    for (const c of child) {
      if (c && typeof c === 'object') callRefCleanupFor(c as VNode, reg)
    }
  } else if (typeof child === 'object') {
    callRefCleanupFor(child as VNode, reg)
  }
}

/** 通知 ref 清理 + Portal 子容器清理（指定实例） */
export function callRefCleanupFor(input: any, reg: Registry): void {
  if (input == null || typeof input !== 'object') return
  const vnode = input as VNode

  // 组件卸载：从 idRegistry 注销并清除渲染状态
  if (vnode._id) {
    if (vnode._customId) reg.idRegistry.delete(vnode._customId)
    reg.idRegistry.delete(vnode._id)
    // 卸载通知（快照遍历——钩子内可能自退订）
    if (reg.unmountHooks.length > 0) {
      const hooks = [...reg.unmountHooks]
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
        if (child && typeof child === 'object') callRefCleanupFor(child as VNode, reg)
      }
    } else {
      callRefCleanupFor(vnode._child as VNode, reg)
    }
    vnode._child = undefined
  }
  // 递归 props.children（寻找子组件 VNode）
  if (vnode.props?.children && typeof vnode.type === 'string') {
    const children = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
    for (const child of children) {
      if (child && typeof child === 'object') callRefCleanupFor(child as VNode, reg)
    }
  }
  // 执行 ref 清理（safeCallRef 防用户逻辑抛错中断递归）
  if (typeof vnode.props?.ref === 'function') safeCallRef(vnode.props.ref, null, 'cleanup')

  // Portal 子容器移除 + 子内容 ref 清理
  if (vnode._remoteEl) {
    cleanupPortalChildren(vnode, reg)
    vnode._remoteEl.remove()
    vnode._remoteEl = undefined
  }
}
