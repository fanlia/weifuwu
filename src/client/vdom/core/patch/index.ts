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
  /** P1 性能索引：父子（parent id → 子 id 集合）——procRemove 子树收集
   *  O(N²)（前缀全量扫描——admin 全量 59s 实证）→ O(k) DFS。
   *  语义：id 空间逻辑树（cmd.parent 字符串键——组件逻辑父/锚父同构——
   *  与 DOM 树不必一致——collectDesc 从自身出发不受影响）。 */
  childIds = new Map<string, Set<string>>()
  /** P1 反向索引（child id → parent id）——O(1) 摘除——防泄漏 */
  byChild = new Map<string, string>()
  /** 登记父子（procInsert 成功后——幂等） */
  registerChild(parent: string, id: string): void {
    this.byChild.set(id, parent)
    let s = this.childIds.get(parent)
    if (!s) { s = new Set(); this.childIds.set(parent, s) }
    s.add(id)
  }
  /** 摘除子登记（O(1)——byChild 反查父集合——空集合清键） */
  unregisterChild(id: string): void {
    const parent = this.byChild.get(id)
    if (parent === undefined) return
    this.byChild.delete(id)
    const s = this.childIds.get(parent)
    if (s) {
      s.delete(id)
      if (s.size === 0) this.childIds.delete(parent)
    }
  }
  /** 子树收集（DFS——含自身——O(k)——procRemove 主路径） */
  collectDesc(id: string): string[] {
    const out: string[] = []
    const stack = [id]
    while (stack.length > 0) {
      const cur = stack.pop()!
      out.push(cur)
      const kids = this.childIds.get(cur)
      if (kids) for (const k of kids) stack.push(k)
    }
    return out
  }
  /** **整树替换式重置（2027-09——tour 违例实证）**：resetRoot（innerHTML
   *  清空）后记录表同步清——后续 build 的 parentOf 不再命中残留锚
   *  （DOM 已脱离——记录越权应用→id 空间违例）——事件/ref 清表不清监听 */
  reset(): void {
    this.nodes.clear()
    this.touched.clear()
    this.childIds.clear()
    this.byChild.clear()
    this.eventRegistry.clear()
    this.refRegistry.clear()
  }
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
    // **P1 索引迁移（childIds/byChild——与 nodes 同前缀规则——保持两表
    //  强一致——否则后续 remove 的 collectDesc 走旧键落空（防御残留））**
    for (const [childId, parentId] of [...this.byChild]) {
      const inTree = childId === oldPrefix || childId.startsWith(oldPrefix + '.')
      const parentInTree = parentId === oldPrefix || parentId.startsWith(oldPrefix + '.')
      if (!inTree && !parentInTree) continue
      const newChild = inTree ? newPrefix + childId.slice(oldPrefix.length) : childId
      const newParent = parentInTree ? newPrefix + parentId.slice(oldPrefix.length) : parentId
      this.byChild.delete(childId)
      this.byChild.set(newChild, newParent)
      const s = this.childIds.get(parentId)
      if (s) {
        s.delete(childId)
        if (s.size === 0) this.childIds.delete(parentId)
      }
      let ns = this.childIds.get(newParent)
      if (!ns) { ns = new Set(); this.childIds.set(newParent, ns) }
      ns.add(newChild)
    }
    // 子树根自身作为子的登记迁移（当子树本身是另一节点的子）
    const oldParent = this.byChild.get(oldPrefix)
    if (oldParent !== undefined && !this.byChild.has(newPrefix)) {
      this.unregisterChild(oldPrefix)
      this.registerChild(oldParent, newPrefix)
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

  /** 父节点解析（root/节点表）——**脱离记录回退（2027-09——tour 实证**：
   *  整树替换后残留记录（DOM 已脱离——isConnected=false）——直中返回
   *  残留锚/旧节点 → insertBefore/锚判定错误——跳过脱离记录继续回退） */
  parentOf(cmd: { parent: string }): HTMLElement | null {
    if (cmd.parent === 'root') return this.container
    const direct = this.nodes.get(cmd.parent)
    if (direct && direct.isConnected) return direct as HTMLElement
    // **组件逻辑父回退**（真实 bug：组件直接输出组件时子输出挂组件 compId
    // 下（compId.0——注册表隔离）——组件 id 不是 DOM 节点（nodes 表无）——
    // 逐段截断回退到最近 DOM 祖先——插入位置由 ref（组件槽锚）定位——
    // 父容器只需是 ref 的真实祖先——HoverCard 悬停失效事故的配套修复）
    const segs = cmd.parent.split('.')
    for (let i = segs.length - 1; i > 0; i--) {
      const p = segs.slice(0, i).join('.')
      if (p === 'root') return this.container
      const node = this.nodes.get(p)
      if (node && node.isConnected) return node as HTMLElement
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
