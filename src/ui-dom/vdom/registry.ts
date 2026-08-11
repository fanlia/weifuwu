/**
 * vdom/registry — 组件实例注册表（id → vnode）+ 卸载钩子
 *
 * 组件 id：`_wf_0` 自动分配（精准刷新锚点）+ `_customId`（ctx.ui.selfId 注册）。
 * 卸载钩子：hooks（usePopup/useMedia 等）注册清理回调，组件卸载时执行。
 */

import type { VNode } from '../vnode.ts'

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
