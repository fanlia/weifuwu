/**
 * vdom/registry — 组件实例注册表（id → vnode）+ 卸载钩子
 *
 * 组件 id：`_wf_0` 自动分配（精准刷新锚点）+ `_customId`（ctx.ui.selfId 注册）。
 * 卸载钩子：hooks（usePopup/useMedia 等）注册清理回调，组件卸载时执行。
 */

import type { VNode } from '../vnode2.ts'
import { isComp, isPortal } from '../vnode2.ts'

export interface Registry {
  idRegistry: Map<string, VNode>
  /** 卸载钩子（按组件 id 匹配——组件卸载时执行对应清理） */
  unmountHooks: Array<(id: string) => void>
  nextId(): string
}

let counter = 0

export function createRegistry(): Registry {
  return {
    idRegistry: new Map<string, VNode>(),
    unmountHooks: [],
    nextId: () => `_wf_${counter++}`,
  }
}

/** 给组件 vnode 分配 id（注册表写入） */
export function ensureId(reg: Registry, vnode: VNode): string {
  if (!vnode._id) {
    vnode._id = reg.nextId()
    reg.idRegistry.set(vnode._id, vnode)
  }
  return vnode._id
}

/** 组件卸载回调注册（hooks 清理）——返回退订函数 */
export function onComponentUnmountFor(reg: Registry, hook: (id: string) => void): () => void {
  reg.unmountHooks.push(hook)
  return () => {
    const i = reg.unmountHooks.indexOf(hook)
    if (i >= 0) reg.unmountHooks.splice(i, 1)
  }
}

/** 组件卸载：执行匹配的清理钩子 + 移除注册（vdom 渲染器卸载组件时调用） */
export function cleanupComponent(reg: Registry, id: string): void {
  for (const hook of [...reg.unmountHooks]) hook(id)
  reg.idRegistry.delete(id)
  reg.idRegistry.delete(`custom:${id}`)
}

/** ref 调用错误隔离（用户 ref 抛错不中断渲染/清理管线） */
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

/**
 * 递归 ref 清理 + 组件卸载（组件 vnode 从树中移除时调用）：
 * idRegistry 注销 + 卸载钩子 + _child/props.children 递归 + ref(null) + Portal 容器移除
 */
export function callRefCleanupFor(input: any, reg: Registry): void {
  if (input == null || typeof input !== 'object') return
  const vnode = input as VNode

  // 组件卸载：从 idRegistry 注销并清除渲染状态
  if (vnode._id) {
    if (vnode._customId) reg.idRegistry.delete(vnode._customId)
    reg.idRegistry.delete(vnode._id)
    if (reg.unmountHooks.length > 0) {
      const hooks = [...reg.unmountHooks]
      for (const h of hooks) h(vnode._id)
      if (vnode._customId) for (const h of hooks) h(vnode._customId)
    }
    vnode._id = null
    vnode._customId = null
    if (isComp(vnode)) vnode._render = null
    vnode._parentNode = null
    vnode._refNode = null
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
    vnode._child = null
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
  if (isPortal(vnode)) {
    const remoteEl = vnode._remoteEl
    if (remoteEl) {
      const child = vnode._child
      if (child != null) {
        if (Array.isArray(child)) {
          for (const c of child as VNode[]) {
            if (c && typeof c === 'object') callRefCleanupFor(c as VNode, reg)
          }
        } else if (typeof child === 'object') {
          callRefCleanupFor(child as VNode, reg)
        }
      }
      remoteEl.remove()
      vnode._remoteEl = null
    }
  }
}
