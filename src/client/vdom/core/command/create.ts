/**
 * vdom command — create（节点创建命令）
 *
 * create 携带 attrs = 可序列化面（class/id/style/data-*——服务端 create 即吐
 * 完整开标签——不依赖后续 setProp）；运行时面（事件/ref）走 setProp。
 */

/** 创建元素（attrs 序列化面——服务端吐 HTML 开标签） */
export type CreateCommand = {
  op: 'create'
  id: string
  tag: string
  attrs: Record<string, unknown>
}

/** 创建文本节点 */
export type CreateTextCommand = {
  op: 'createText'
  id: string
  value: string
}

/** 创建占位锚（空洞/portal 槽——childNodes 同构——detail 诊断信息） */
export type CreateAnchorCommand = {
  op: 'createAnchor'
  id: string
  detail?: string
}
