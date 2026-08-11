/**
 * vdom/registry — 组件实例注册表（id → vnode）
 *
 * 组件 id：`_wf_0` 自动分配（精准刷新锚点）+ `_customId`（ctx.ui.selfId 注册）。
 */

export interface Registry {
  idRegistry: Map<string, import('../vnode.ts').VNode>
  nextId(): string
}

let counter = 0

export function createRegistry(): Registry {
  const idRegistry = new Map<string, import('../vnode.ts').VNode>()
  return {
    idRegistry,
    nextId: () => `_wf_${counter++}`,
  }
}

/** 给组件 vnode 分配 id（注册表写入） */
export function ensureId(reg: Registry, vnode: import('../vnode.ts').VNode): string {
  if (!vnode._id) {
    vnode._id = reg.nextId()
    reg.idRegistry.set(vnode._id, vnode)
  }
  return vnode._id
}
