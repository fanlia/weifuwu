/**
 * pptx-vdom vnode.ts — PPTX 专用虚拟节点（独立于 weifuwu/client）
 *
 * 节点语义 = PPTX 语义（slide/text/rect/...），不是 HTML。
 * 组件模型与 weifuwu 一致（纯函数），但不依赖 client、无 DOM。
 *
 * 单位约定：坐标 x/y/w/h 为「英寸」，renderXml 内部转 EMU（1in = 914400 EMU）。
 */

export type PptxNodeType = string | PptxComponent

export interface PptxVNode {
  type: PptxNodeType
  props: Record<string, any>
  key?: string
}

/** 纯函数组件：(props) => VNode | VNode[] | 文本 | null */
export type PptxComponent = (props: any) => any

/** `h`（hyperscript）— 支持 variadic children */
export function h(type: PptxNodeType, props: Record<string, any> | null, ...children: any[]): PptxVNode {
  const p = { ...(props ?? {}) }
  delete p.key
  if (children.length > 0) {
    p.children = children.length === 1 ? children[0] : children
  }
  return { type, props: p, key: props?.key }
}

export function isComponent(vnode: PptxVNode): boolean {
  return typeof vnode.type === 'function'
}

/**
 * PPTX intrinsic 元素（v0.1 受控子集）
 * ─────────────────────────────────────────────
 * slide     页面根容器   { bg?: string, width?, height? }
 * rect      矩形        { x,y,w,h, fill?, lineColor?, lineWidth?, radius? }
 * roundedRect 圆角矩形  { x,y,w,h, fill?, radius? }
 * ellipse   椭圆        { x,y,w,h, fill? }
 * line      线条        { x1,y1,x2,y2, color?, weight? }
 * text      文本框      { x,y,w,h, text?, fontSize?, bold?, color?, align?,
 *                         fontFace?, lineSpacing?, valign? }
 * bullets   项目符号列表 { x,y,w,h, points: string[], fontSize?, color?, gap? }
 */
