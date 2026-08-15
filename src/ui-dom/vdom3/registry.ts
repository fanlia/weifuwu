/**
 * vdom3 registry — 节点注册表（id ↔ DOM 节点双向映射）
 *
 * 事件流指令用 id 定位（NODE_CREATE id / INSERT parent/child）——回放/取消需要
 * 从 id 解析节点。native 元素用 data-v3-id 属性；文本/注释节点无属性——用 WeakMap。
 * REMOVE 时保存被移除节点（undo 恢复——取消的节点快照）。
 */

export class NodeRegistry {
  private byId = new Map<string, Node>()
  private idByNode = new WeakMap<Node, string>()
  /** 被移除节点（id → node——undo 恢复用） */
  private removed = new Map<string, Node>()

  register(id: string, node: Node): void {
    this.byId.set(id, node)
    this.idByNode.set(node, id)
  }

  /** 节点 → id（native 元素读 data-v3-id；其他查 WeakMap） */
  idOf(node: Node | null): string {
    if (!node) return 'null'
    if (node.nodeType === 1) {
      return (node as Element).getAttribute('data-v3-id') ?? this.idByNode.get(node) ?? 'el'
    }
    return this.idByNode.get(node) ?? 'node'
  }

  /** id → 节点（回放/取消） */
  get(id: string): Node | null {
    return this.byId.get(id) ?? null
  }

  /** 移除记录（REMOVE 时调用——保存节点供 undo） */
  unregister(id: string, node: Node): void {
    this.byId.delete(id)
    this.removed.set(id, node)
  }

  /** 恢复被移除节点（undo 的 REMOVE 逆操作） */
  takeRemoved(id: string): Node | null {
    const n = this.removed.get(id)
    if (n) this.removed.delete(id)
    return n ?? null
  }

  /** 根节点 id（replay 目标容器映射） */
  static ROOT = 'root'
}
