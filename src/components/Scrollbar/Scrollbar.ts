/**
 * weifuwu/components — Scrollbar 自定义滚动容器
 *
 * 三库等价：EP Scrollbar / shadcn ScrollArea（容器滚动区域）。
 * webkit 滚动条样式封装 + hover 显示：
 *
 *   <Scrollbar maxHeight={300}>长内容</Scrollbar>
 *
 * 裁剪（CS-05）：不做虚拟滚动/拖动滚动条 thumb（VirtualList 覆盖虚拟化）。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface ScrollbarProps {
  maxHeight?: number | string
  height?: number | string
  orientation?: 'vertical' | 'horizontal'
  /** 常显滚动条（默认 hover 显示） */
  always?: boolean
  children?: any
  style?: any
}

export const Scrollbar: Component<ScrollbarProps> = (_init, _ctx: WfuiContext) =>
  (props) => {
    const { maxHeight, height, orientation = 'vertical', always, children, style } = props
    const hAxis = orientation === 'horizontal'
    return h('div', {
      class: `wf-scrollbar${always ? ' wf-scrollbar--always' : ''}`,
      style: {
        ...style,
        maxHeight: maxHeight !== undefined ? (typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight) : undefined,
        height: height !== undefined ? (typeof height === 'number' ? `${height}px` : height) : undefined,
        overflowY: hAxis ? undefined : 'auto',
        overflowX: hAxis ? 'auto' : undefined,
      },
    }, children)
  }
