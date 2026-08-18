/**
 * vdom3 shadow — 影子状态（DOM 抽象——vdom4 P1：唯一真相——fold 唯一推进）
 *
 * 锚点法核心：**每个 children 数组槽位恒有一个注释锚**（`<!--wf-anchor-->`，
 * 内容在其后）——槽位 i ⟷ anchors[parent][i]——位置 O(1) 查询（不再 domIdx/
 * widthOf/_outFirst/_outLast 宽度推导——锚失效 = 结构损坏 = 明确失败）。
 * 空洞（false/null/undefined）槽位 = 只有锚（无内容）——占位法并入锚点法。
 *
 * 影子由 apply（fold）唯一推进：build/diff 只读。声明可以陈旧，影子不能。
 * （vdom4 P4 会话实例化——当前模块级单例——与 registry 同生命周期）
 */

/** 影子状态（DOM 抽象——锚数组 + 节点登记） */
export class ShadowState {
  /** 父容器 id → 槽位锚 id 列表（DOM 顺序——槽位 i ⟷ anchors[i]） */
  anchors = new Map<string, string[]>()
  /** 锚判定（createAnchor 登记） */
  isAnchor = new Map<string, boolean>()
  /** 节点/锚 → 父容器 id（insert/remove 维护） */
  parentOf = new Map<string, string>()

  /** 某父的锚列表（读——不存在返回空——不创建） */
  anchorsOf(parentId: string): string[] {
    return this.anchors.get(parentId) ?? []
  }

  /** 锚登记（createAnchor——apply 时） */
  registerAnchor(id: string, parentId: string): void {
    this.isAnchor.set(id, true)
    this.parentOf.set(id, parentId)
  }

  /** 节点登记（create/insert——apply 时） */
  registerNode(id: string, parentId: string | null): void {
    this.parentOf.set(id, parentId ?? '')
  }

  /** 锚插入（apply 的 insert 命令——atIndex 由 ref 锚位置推导） */
  insertAnchor(parentId: string, anchorId: string, atIndex: number): void {
    const arr = this.anchors.get(parentId) ?? []
    arr.splice(atIndex, 0, anchorId)
    this.anchors.set(parentId, arr)
  }

  /** 锚移除（apply 的 remove 命令——返回原 index） */
  removeAnchor(parentId: string, anchorId: string): number {
    const arr = this.anchors.get(parentId)
    if (!arr) return -1
    const idx = arr.indexOf(anchorId)
    if (idx >= 0) arr.splice(idx, 1)
    return idx
  }

  /** 锚 index（槽位定位——-1 = 不在列表） */
  indexOfAnchor(parentId: string, anchorId: string): number {
    return this.anchors.get(parentId)?.indexOf(anchorId) ?? -1
  }

  /** 锚的下一锚（区间边界——内容区间 = (锚, 下一锚)——null = 父末尾） */
  anchorAfter(parentId: string, anchorId: string): string | null {
    const arr = this.anchors.get(parentId)
    if (!arr) return null
    const idx = arr.indexOf(anchorId)
    if (idx < 0 || idx + 1 >= arr.length) return null
    return arr[idx + 1]
  }

  /** 锚区间移动（keyed 重排——apply 的 moveSlot——移到 ref 锚之后） */
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

  /** 节点注销（remove——apply 时） */
  unregister(id: string): void {
    this.isAnchor.delete(id)
    this.parentOf.delete(id)
  }

  // ── hydration 吸收（P5——SSR 首帧零重建：现有 DOM 按结构队列复用） ──
  /** 吸收队列（现有 DOM 节点——DFS 序——与 gen 命令序同构——apply 的 create 按序消耗） */
  absorbQueue: Node[] | null = null
  /** 吸收复用的节点（保留标记——未标记的旧节点 mount 后移除） */
  absorbedNodes = new WeakSet<Node>()

  /** 开始吸收（mount 检测到 SSR 内容时）——DFS 收集现有节点 */
  beginAbsorb(root: Element): void {
    const queue: Node[] = []
    const walk = (el: Element): void => {
      for (const n of [...el.childNodes]) {
        queue.push(n)
        if (n.nodeType === 1) walk(n as Element)
      }
    }
    walk(root)
    this.absorbQueue = queue
  }

  /** 消耗队列头（create 复用尝试——类型匹配返回节点并登记保留标记——否则 null） */
  takeAbsorbed(match: (n: Node) => boolean): Node | null {
    if (!this.absorbQueue || this.absorbQueue.length === 0) return null
    const n = this.absorbQueue[0]
    if (!match(n)) return null // 类型不符——不消耗（重建——旧节点后续移除）
    this.absorbQueue.shift()
    this.absorbedNodes.add(n)
    return n
  }

  /** 吸收结束（mount apply 后——清理队列状态） */
  endAbsorb(): void {
    this.absorbQueue = null
  }
}

/** 模块级单例（vdom4 P4 会话实例化——当前与 registry 同生命周期） */
export const shadow = new ShadowState()
