/**
 * weifuwu/components — Grid 栅格 + Flex 容器
 *
 * 三库等价：antd Row/Col/Flex、EP Row/Col。
 * 24 栅格 + gutter + flex 容器模式（单行弹性布局 = antd Flex 场景）：
 *
 *   <Grid gutter={16}>
 *     <Col span={8}>A</Col>
 *     <Col span={8}>B</Col>
 *   </Grid>
 *   <Grid flex gap={8} direction="row">...</Grid>
 *
 * 裁剪（CS-05）：不做响应式断点 props（useBreakpoint 由用户驱动）；
 * gutter 仅水平（垂直 gutter 低频）。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface GridProps {
  gutter?: number
  flex?: boolean
  gap?: number
  direction?: 'row' | 'column'
  align?: 'start' | 'center' | 'end' | 'stretch'
  children?: any
}

export interface ColProps {
  /** 0-24 栅格跨度；0 = flex:1 占剩余 */
  span?: number
  gutter?: number
  children?: any
}

/** 栅格跨度 → 宽度（纯函数——可单测/SSR） */
export function gridColumns(span: number): string {
  if (span <= 0) return '1'
  return `${(span / 24) * 100}%`
}

export const Grid: Component<GridProps> = (_init, _ctx: WfuiContext) =>
  (props) => {
    const { gutter, flex, gap, direction = 'row', align, children } = props
    const half = gutter ? gutter / 2 : 0
    // gutter 通过 style 传递——子 Col 从 Grid 拿（简化：注入 gutter 到 children props）
    const kids = Array.isArray(children)
      ? children.map((c: any) =>
          c && typeof c === 'object' && c.type === Col
            ? h(Col, { ...c.props, gutter }, c.props?.children)
            : c)
      : children

    return h('div', {
      class: `wf-grid-comp${flex ? ' wf-grid-comp--flex' : ''}${direction === 'column' ? ' wf-grid-comp--column' : ''}`,
      style: {
        margin: half ? `0 -${half}px` : undefined,
        gap: gap !== undefined ? `${gap}px` : undefined,
        alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align,
      },
    }, kids)
  }

export const Col: Component<ColProps> = (_init, _ctx: WfuiContext) =>
  (props) => {
    const { span = 24, gutter, children } = props
    const half = gutter ? gutter / 2 : 0
    return h('div', {
      class: 'wf-col',
      style: {
        width: gridColumns(span),
        flex: span <= 0 ? '1' : '0 0 auto',
        padding: half ? `0 ${half}px` : undefined,
      },
    }, children)
  }
