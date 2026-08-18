/**
 * vdom3 registry — 节点注册表（id ↔ DOM 节点双向映射）
 *
 * 事件流指令用 id 定位（NODE_CREATE id / INSERT parent/child）——回放/取消需要
 * 从 id 解析节点。native 元素用 data-v3-id 属性；文本/注释节点无属性——用 WeakMap。
 * REMOVE 时保存被移除节点（undo 恢复——取消的节点快照）。
 */

/** portal 容器（#__wf_portal > [data-wf-portal-key]——lazy 创建——组件库浮层基础） */
export function ensurePortalContainer(key: string): HTMLElement {
  let rootEl = document.getElementById('__wf_portal')
  if (!rootEl) {
    rootEl = document.createElement('div')
    rootEl.id = '__wf_portal'
    document.body.appendChild(rootEl)
  }
  let c = rootEl.querySelector(`[data-wf-portal-key="${key}"]`) as HTMLElement | null
  if (!c) {
    c = document.createElement('div')
    c.setAttribute('data-wf-portal-key', key)
    rootEl.appendChild(c)
  }
  return c
}

export class NodeRegistry {
  private byId = new Map<string, Node>()
  private idByNode = new WeakMap<Node, string>()
  /** 被移除节点（id → node——undo 恢复用） */
  private removed = new Map<string, Node>()

  /** portal 容器 id 约定（事件流 parent 用——replay 可解析） */
  static PORTAL = (key: string): string => `portal:${key}`

  /** 解析父 id（portal: 前缀 → lazy 容器；否则查注册表） */
  resolveParent(id: string): Node | null {
    if (id.startsWith('portal:')) return ensurePortalContainer(id.slice(7))
    return this.get(id)
  }

  /** id → 节点（回放/取消）——含 portal 容器 */
  get(id: string): Node | null {
    if (id.startsWith('portal:')) return ensurePortalContainer(id.slice(7))
    return this.byId.get(id) ?? null
  }

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
