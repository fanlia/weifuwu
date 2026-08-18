/**
 * vdom core — Command 类型（渲染指令流——纯数据——自足不依赖 vn 引用）
 *
 * 设计（design/vdom-plan.md §3）：Handler 返回原生 Response——body =
 * ReadableStream<Command>——客户端逐条 apply 到 DOM——服务端经
 * commandToHtml() TransformStream 流式吐 HTML。
 */

/** 渲染指令（流元素——修改 DOM 的最小操作集） */
export type Command =
  /** 创建元素——attrs 携带可序列化面（class/id/style/data-*——服务端 create
   *  即吐完整开标签——不依赖后续 setProp） */
  | { op: 'create'; id: string; tag: string; attrs: Record<string, unknown> }
  /** 创建文本节点 */
  | { op: 'createText'; id: string; value: string }
  /** 创建占位锚（空洞/portal 槽——childNodes 同构） */
  | { op: 'createAnchor'; id: string }
  /** 离开子树——服务端闭合标签——客户端 no-op */
  | { op: 'close'; id: string }
  /** 挂载节点（parent/ref 均为节点 id——ref null = 追加尾部） */
  | { op: 'insert'; id: string; parent: string; ref: string | null }
  /** 运行时属性/事件/ref（不可序列化面——服务端 no-op——客户端 apply） */
  | { op: 'setProp'; id: string; key: string; value: unknown }
  /** 文本更新 */
  | { op: 'setText'; id: string; value: string }
  /** 移除节点（含子树） */
  | { op: 'remove'; id: string }
  /** 卸载组件（清理注册——onUnmount 回调） */
  | { op: 'unmountComp'; compId: string }
  /** 流结束 = 渲染完成 */
  | { op: 'done' }
