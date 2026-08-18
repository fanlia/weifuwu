/**
 * vdom4 shadow — 影子状态（唯一真相——fold 唯一推进）
 *
 * 锚点法（复用 vdom3 P1 验证的语义）：每 children 槽位恒一锚——逻辑容器锚列表
 * （组件/Fragment 输出内部锚登记到输出锚）——槽位 O(1) 定位。
 * 组件实例：compId（确定性路径）→ CompInstance（renderFn/lastOutput/nextOutput）——
 * vnode 纯数据——实例状态唯一持有者。
 */

import type { VNode, RenderFn } from './types.ts'

/** 组件实例（vnode 值化——实例状态唯一持有者） */
export interface CompInstance {
  type: unknown
  renderFn: RenderFn
  lastProps: Record<string, unknown>
  /** 上次落地输出（DOM 对应——diff 的旧对照） */
  lastOutput: VNode | null
  /** 本次构建暂存（diff 完成后 commit——提前更新丢失旧对照） */
  nextOutput: VNode | null
}

/** 影子状态 */
export class ShadowState {
  /** 父容器路径 → 槽位锚 id（DOM 顺序——槽位 i ⟷ anchors[i]） */
  anchors = new Map<string, string[]>()
  /** 锚判定 */
  isAnchor = new Map<string, boolean>()
  /** 锚/节点 → 父容器路径 */
  parentOf = new Map<string, string>()
  /** 组件实例表（compId（路径）→ 实例） */
  instances = new Map<string, CompInstance>()

  anchorsOf(parentId: string): string[] {
    return this.anchors.get(parentId) ?? []
  }
  registerAnchor(id: string, parentId: string): void {
    this.isAnchor.set(id, true)
    this.parentOf.set(id, parentId)
  }
  registerNode(id: string, parentId: string): void {
    this.parentOf.set(id, parentId)
  }
  unregister(id: string): void {
    this.isAnchor.delete(id)
    this.parentOf.delete(id)
  }

  insertAnchor(parentId: string, anchorId: string, atIndex: number): void {
    const arr = this.anchors.get(parentId) ?? []
    arr.splice(atIndex, 0, anchorId)
    this.anchors.set(parentId, arr)
  }
  removeAnchor(parentId: string, anchorId: string): number {
    const arr = this.anchors.get(parentId)
    if (!arr) return -1
    const idx = arr.indexOf(anchorId)
    if (idx >= 0) arr.splice(idx, 1)
    return idx
  }
  indexOfAnchor(parentId: string, anchorId: string): number {
    return this.anchors.get(parentId)?.indexOf(anchorId) ?? -1
  }
  anchorAfter(parentId: string, anchorId: string): string | null {
    const arr = this.anchors.get(parentId)
    if (!arr) return null
    const idx = arr.indexOf(anchorId)
    if (idx < 0 || idx + 1 >= arr.length) return null
    return arr[idx + 1]
  }
  /** 锚移到 ref 锚后（keyed 重排） */
  moveAnchorTo(parentId: string, anchorId: string, refId: string | null): void {
    const arr = this.anchors.get(parentId)
    if (!arr) return
    const from = arr.indexOf(anchorId)
    if (from < 0) return
    arr.splice(from, 1)
    if (refId) {
      const refIdx = arr.indexOf(refId)
      arr.splice(refIdx + 1, 0, anchorId)
    } else {
      arr.splice(0, 0, anchorId)
    }
  }

  // ── 组件实例 ──
  setInstance(compId: string, inst: CompInstance): void {
    this.instances.set(compId, inst)
  }
  getInstance(compId: string): CompInstance | null {
    return this.instances.get(compId) ?? null
  }
  deleteInstance(compId: string): void {
    this.instances.delete(compId)
  }
  /** 落地提交（diff/apply 完成后——nextOutput → lastOutput） */
  commitOutput(compId: string): void {
    const inst = this.instances.get(compId)
    if (inst?.nextOutput != null) {
      inst.lastOutput = inst.nextOutput
      inst.nextOutput = null
    }
  }
  commitAll(): void {
    for (const id of [...this.instances.keys()]) this.commitOutput(id)
  }

  // ── hydration 吸收（SSR 首帧零重建——**路径 id 精确匹配**（元素——确定性 id）+
  //  结构队列（文本/锚注释——无 id 标记——DFS 序）） ──
  absorbIdMap: Map<string, Node> | null = null
  absorbQueue: Node[] | null = null
  absorbedNodes = new WeakSet<Node>()
  beginAbsorb(root: Element): void {
    const idMap = new Map<string, Node>()
    const queue: Node[] = []
    const walk = (el: Element): void => {
      for (const n of [...el.childNodes]) {
        if (n.nodeType === 1) {
          const id = (n as Element).getAttribute('data-v4-id')
          if (id) idMap.set(id, n)
          walk(n as Element)
        } else {
          queue.push(n)
        }
      }
    }
    walk(root)
    this.absorbIdMap = idMap
    this.absorbQueue = queue
  }
  /** 按路径 id 精确匹配（元素） */
  takeAbsorbedById(id: string): Node | null {
    if (!this.absorbIdMap) return null
    const n = this.absorbIdMap.get(id) ?? null
    if (n) { this.absorbIdMap.delete(id); this.absorbedNodes.add(n) }
    return n
  }
  /** 结构队列匹配（文本/锚——无 id 标记） */
  takeAbsorbed(match: (n: Node) => boolean): Node | null {
    if (!this.absorbQueue || this.absorbQueue.length === 0) return null
    const n = this.absorbQueue[0]
    if (!match(n)) return null
    this.absorbQueue.shift()
    this.absorbedNodes.add(n)
    return n
  }
  endAbsorb(): void {
    this.absorbIdMap = null
    this.absorbQueue = null
  }
}
