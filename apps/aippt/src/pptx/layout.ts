/**
 * pptx-vdom layout.ts — 相对布局 → 绝对坐标（英寸）
 *
 * PPT 本质是绝对定位，但组件层提供相对布局帮助：
 *   VStack(children, opts)  垂直堆叠，自动计算每个子元素的 y
 *   HStack(children, opts)  水平排列，自动计算每个子元素的 x
 *   Grid(children, opts)    等宽栅格
 *
 * 子元素的高度取 props.h（默认 0.4in）；组件也可返回 {h, vnode} 显式指定。
 */

import type { PptxVNode } from './vnode.ts'

export interface StackOptions {
  x: number
  y: number
  w: number
  /** 元素间距（英寸） */
  gap?: number
  /** 水平对齐：left 左对齐 / center 居中 / right 右对齐（需子元素有 w） */
  align?: 'left' | 'center' | 'right'
}

type StackItem = PptxVNode | { h?: number; vnode: PptxVNode }

function norm(items: StackItem[]): { node: PptxVNode; h: number }[] {
  return items.map((it) => {
    if ('vnode' in it) return { node: it.vnode, h: it.h ?? 0.4 }
    return { node: it, h: it.props.h ?? 0.4 }
  })
}

/** 垂直堆叠：返回补全 x/y/w 的 VNode 数组 */
export function VStack(items: StackItem[], opts: StackOptions): PptxVNode[] {
  const gap = opts.gap ?? 0.2
  let cursor = opts.y
  return norm(items).map(({ node, h }) => {
    const w = node.props.w ?? opts.w
    let x = opts.x
    if (opts.align === 'center') x = opts.x + (opts.w - w) / 2
    if (opts.align === 'right') x = opts.x + opts.w - w
    const out = { ...node, props: { ...node.props, x, y: cursor, w } }
    cursor += h + gap
    return out
  })
}

/** 水平排列：返回补全 x/y/w 的 VNode 数组 */
export function HStack(items: StackItem[], opts: StackOptions): PptxVNode[] {
  const gap = opts.gap ?? 0.2
  let cursor = opts.x
  return norm(items).map(({ node, h }) => {
    const w = node.props.w ?? opts.w / items.length
    const out = { ...node, props: { ...node.props, x: cursor, y: opts.y, w, h } }
    cursor += w + gap
    return out
  })
}

export interface GridOptions {
  x: number
  y: number
  w: number
  cols: number
  gap?: number
  itemH: number
}

/** 等宽栅格：按行优先填充，返回补全坐标的 VNode 数组 */
export function Grid(items: PptxVNode[], opts: GridOptions): PptxVNode[] {
  const gap = opts.gap ?? 0.2
  const colW = (opts.w - (opts.cols - 1) * gap) / opts.cols
  return items.map((node, i) => {
    const col = i % opts.cols
    const row = Math.floor(i / opts.cols)
    return {
      ...node,
      props: {
        ...node.props,
        x: opts.x + col * (colW + gap),
        y: opts.y + row * (opts.itemH + gap),
        w: colW,
        h: opts.itemH,
      },
    }
  })
}

/** 返回 n 个子元素的 VNode 数组（由组件函数返回多个元素时用） */
export function pack(nodes: PptxVNode[]): PptxVNode[] {
  return nodes
}

export interface GridPos {
  x: number
  y: number
  w: number
  h: number
}

/** 计算第 i 项在栅格中的位置（供返回多元素的 widget 使用） */
export function gridPos(
  i: number,
  opts: { x: number; y: number; w: number; cols: number; gap?: number; itemH: number },
): GridPos {
  const gap = opts.gap ?? 0.2
  const colW = (opts.w - (opts.cols - 1) * gap) / opts.cols
  const col = i % opts.cols
  const row = Math.floor(i / opts.cols)
  return { x: opts.x + col * (colW + gap), y: opts.y + row * (opts.itemH + gap), w: colW, h: opts.itemH }
}
