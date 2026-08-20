/**
 * vdom core/patch — index（patch 阶段中转站）
 *
 * 职责：**中转站——自身不处理细节逻辑**——apply 命令 → dispatch（处理器
 * 独立文件：processors.ts/fields.ts）——本文件只持有状态（nodes 表/
 * 事件代理/ref 注册表/portal 容器）+ 通用内部方法（父解析/清理/重映射）。
 *
 * 状态公开（同包约定——处理器访问）——资源生命周期：
 * - ref（挂载/卸载——RefRegistry）；事件（EventRegistry 代理）
 * - remove/done/removePortal（子树清理——ref(null) + 事件表）
 * - move（顺移 remap / 移动 + 重映射）
 */

import type { Command } from '../command/index.ts'
import { EventRegistry } from '../field/events.ts'
import { RefRegistry } from '../field/ref.ts'
import { disposeComponent, type ComponentRegistry } from '../node/component.ts'
import { PORTAL_CONTAINER_ID, PORTAL_ID_PREFIX, portalContainerId } from '../node/portal.ts'
import { dispatch } from './processors.ts'
import type { WfNode } from './processors.ts'

export type { WfNode }

/** CommandApplier（中转——状态 + 通用方法——命令消费细节在 processors） */
export class CommandApplier {
  /** 节点表（id → DOM 节点） */
  nodes = new Map<string, WfNode>()
  /** 本流已创建 id（done.full 清理） */
  touched = new Set<string>()
  /** 事件代理注册表（document 捕获监听——分发） */
  eventRegistry: EventRegistry
  /** ref 全局注册表（挂载/卸载查表触发） */
  refRegistry = new RefRegistry()
  /** portal 容器（key → 容器元素） */
  portalContainers = new Map<string, HTMLElement>()
  container: HTMLElement
  doc: Document
  registry: ComponentRegistry | null

  constructor(container: HTMLElement, doc: Document, registry?: ComponentRegistry) {
    this.container = container
    this.doc = doc
    this.registry = registry ?? null
    this.eventRegistry = new EventRegistry(doc)
  }

  /** 卸载清理（根代理/ref 表——serve unmount） */
  dispose(): void {
    this.eventRegistry.dispose()
    this.refRegistry.dispose()
  }

  /** 子树 ref 清理（卸载指令——ref(null) + 表删除——remove/done 共用） */
  clearNodeRefs(id: string): void {
    this.refRegistry.unmount(id)
  }

  /** 子树 id 重映射（move——nodes/事件表/refs 前缀迁移） */
  remapSubtree(oldPrefix: string, newPrefix: string): void {
    const remap = (map: Map<string, unknown>, key: string): void => {
      const v = map.get(key)
      if (v === undefined) return
      map.delete(key)
      map.set(newPrefix + key.slice(oldPrefix.length), v)
    }
    for (const id of [...this.nodes.keys()]) {
      if (id === oldPrefix || id.startsWith(oldPrefix + '.')) {
        remap(this.nodes as unknown as Map<string, unknown>, id)
        // **DOM 属性同步**（真实 bug）：分发按 DOM 的 data-wf-id 查表——
        // remap 只迁移表——DOM 属性残留旧 id——keyed 顺移后 click 未命中
        const el = this.nodes.get(newPrefix + id.slice(oldPrefix.length))
        if (el && el.nodeType === 1) (el as HTMLElement).setAttribute('data-wf-id', newPrefix + id.slice(oldPrefix.length))
      }
    }
    this.refRegistry.remap(oldPrefix, newPrefix)
    for (const id of [...this.eventRegistry['table'].keys()]) {
      if (id === oldPrefix || id.startsWith(oldPrefix + '.')) {
        const v = this.eventRegistry['table'].get(id)!
        this.eventRegistry['table'].delete(id)
        this.eventRegistry['table'].set(newPrefix + id.slice(oldPrefix.length), v)
      }
    }
  }

  /** portal 容器（#__wf_portal 下按 key——惰性创建） */
  portalContainer(key: string): HTMLElement {
    let c = this.portalContainers.get(key)
    if (c) return c
    let host = this.doc.getElementById(PORTAL_CONTAINER_ID)
    if (!host) {
      host = this.doc.createElement('div')
      host.id = PORTAL_CONTAINER_ID
      this.doc.body.appendChild(host)
    }
    c = this.doc.createElement('div')
    c.id = portalContainerId(key)
    host.appendChild(c)
    this.portalContainers.set(key, c)
    return c
  }

  /** 父节点解析（root/portal 容器/节点表） */
  parentOf(cmd: { parent: string }): HTMLElement | null {
    if (cmd.parent === 'root') return this.container
    if (cmd.parent.startsWith(PORTAL_ID_PREFIX)) {
      const node = this.nodes.get(cmd.parent)
      if (node) return node as HTMLElement
      return this.portalContainer(cmd.parent.slice(PORTAL_ID_PREFIX.length))
    }
    const direct = this.nodes.get(cmd.parent)
    if (direct) return direct as HTMLElement
    // **组件逻辑父回退**（真实 bug：组件直接输出组件时子输出挂组件 compId
    // 下（compId.0——注册表隔离）——组件 id 不是 DOM 节点（nodes 表无）——
    // 逐段截断回退到最近 DOM 祖先——插入位置由 ref（组件槽锚）定位——
    // 父容器只需是 ref 的真实祖先——HoverCard 悬停失效事故的配套修复）
    const segs = cmd.parent.split('.')
    for (let i = segs.length - 1; i > 0; i--) {
      const p = segs.slice(0, i).join('.')
      if (p === 'root') return this.container
      const node = this.nodes.get(p)
      if (node) return node as HTMLElement
    }
    return null
  }

  /** 中转——命令 → 处理器（细节在 processors.ts） */
  apply(cmd: Command): void {
    dispatch(this, cmd)
  }
}

export { disposeComponent }
