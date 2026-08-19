/**
 * vdom command — insert/remove（挂载与移除命令）
 *
 * insert 的 ref = 已插入的**前一个兄弟**（流式渲染——后一个尚未插入）——
 * apply 侧插到 prev 之后（insertBefore(el, prev.nextSibling)）；ref null =
 * 追加尾部。
 */

/** 挂载节点（parent/ref 均为节点 id） */
export type InsertCommand = {
  op: 'insert'
  id: string
  parent: string
  ref: string | null
}

/** 移动节点（keyed 重排——**DOM 不重建**——子树 id 重映射——
 *  id = 旧 id；ref = 前一个兄弟（insertAfter 语义——null = 尾部）；
 *  first = 移到父最前（首位标记）；newId = 新位置 id（子树前缀迁移）） */
export type MoveCommand = {
  op: 'move'
  id: string
  parent: string
  ref: string | null
  newId: string
  first?: boolean
  /** 顺移 remap-only（相对顺序一致——DOM 位置自然到位——只做 id 前缀迁移） */
  noMove?: boolean
}

/** 移除节点（含子树——事件监听随元素 GC） */
export type RemoveCommand = {
  op: 'remove'
  id: string
}

/** 移除 portal 容器内容（浮层关闭清理——主树锚移除 + 容器内容清空） */
export type RemovePortalCommand = {
  op: 'removePortal'
  key: string
}
