/**
 * vdom core/patch — index（patch 阶段中转站）
 *
 * 职责：**中转站——自身不处理细节逻辑**——apply 命令 → dispatch（处理器
 * 独立文件：processors.ts/fields.ts）——本文件只持有状态（nodes 表/
 * 事件代理/ref 注册表）+ 通用内部方法（父解析/清理/重映射）。
 *
 * 状态公开（同包约定——处理器访问）——资源生命周期：
 * - ref（挂载/卸载——RefRegistry）；事件（EventRegistry 代理）
 * - remove/done（子树清理——ref(null) + 事件表）
 * - move（顺移 remap / 移动 + 重映射）
 */

import type { Command } from '../command/index.ts'
import { EventRegistry } from '../field/events.ts'
import { RefRegistry } from '../field/ref.ts'
import { disposeComponent, type ComponentRegistry } from '../node/component.ts'

import { AbsorbState } from '../ssr/absorb.ts'
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
  /** SSR 吸收状态（结构对齐——DFS 序游标——create 复用已有 DOM） */
  absorb = new AbsorbState()
  container: HTMLElement
  doc: Document
  registry: ComponentRegistry | null
  /** dev 验证器（P3b——可选注入——命令消费后 Post 断言——生产零开销） */
  devVerify: ((cmd: Command, applier: CommandApplier) => void) | null = null

  constructor(container: HTMLElement, doc: Document, registry?: ComponentRegistry) {
    this.container = container
    this.doc = doc
    this.registry = registry ?? null
    // **容器过滤**（命令式弹窗独立 applier）：事件仅分发容器内 target
    // （id 同路径冲突——主树事件误命中独立表——toast onRemove 实证）
    this.eventRegistry = new EventRegistry(doc, container)
  }

  /** 卸载清理（根代理/ref 表——serve unmount） */
  dispose(): void {
    this.eventRegistry.dispose()
    this.refRegistry.dispose()
    // **组件实例卸载**（命令式宿主——openPopup 的 env.onUnmount（dispose）
    // 依赖组件卸载触发——否则 renderPortal 的 #__wf_portal 容器残留——
    // 命令式 confirm 确定后 Modal 面板残留实证）
    if (this.registry) {
      for (const id of [...this.registry.keys()].reverse()) {
        const rec = this.registry.get(id)
        if (rec) {
          for (const fn of [...rec.onUnmounts].reverse()) { try { fn() } catch { /* 清理容错 */ } }
          this.registry.delete(id)
        }
      }
    }
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
    // **组件实例迁移（G9——move remap 后 diff 生成端按新 id 对照——
    //  registry 不迁移则 rec 查询落空 → 工厂重跑 + 旧 rec 残留（S_INST
    //  面——重复 key fuzz 1/300 实证））**：rec 前缀迁移（hookStates/
    //  onUnmounts 保持——实例状态跨 move 保持——与 keyed .k{key}
    //  位置无关语义一致）
    if (this.registry) {
      for (const id of [...this.registry.keys()]) {
        if (id === oldPrefix || id.startsWith(oldPrefix + '.')) {
          const rec = this.registry.get(id)!
          this.registry.delete(id)
          this.registry.set(newPrefix + id.slice(oldPrefix.length), rec)
        }
      }
    }
  }

  /** 父节点解析（root/节点表） */
  parentOf(cmd: { parent: string }): HTMLElement | null {
    if (cmd.parent === 'root') return this.container
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

  /** 中转——命令 → 处理器（细节在 processors.ts）——dev 模式 Post 断言 */
  apply(cmd: Command): void {
    dispatch(this, cmd)
    if (this.devVerify) this.devVerify(cmd, this)
  }
}

export { disposeComponent }
