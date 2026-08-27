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
 * 裁剪（CS-05，见 design/components-cuts.md）：不做响应式断点 props（useBreakpoint 由用户驱动）；
 * gutter 仅水平（垂直 gutter 低频）。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { keyOf } from '../../vdom/core/node/keyed.ts'

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

export const Grid: Component<GridProps> = async (_init, _ctx: UIContext) =>
  async (props) => {
    const { gutter, flex, gap, direction = 'row', align, children } = props
    const half = gutter ? gutter / 2 : 0
    // gutter 通过 style 传递——子 Col 从 Grid 拿（简化：注入 gutter 到 children props）
    // **key 保持纪律（2026-08——A 级检测实证）**：h() 把 key 从 props 剥离进
    // vnode.key——`{ ...c.props, gutter }` 拿不到 key——用户声明的 Col 身份
    // 丢失（动态 Col 列表按位置继承——Grid 状态错位）——显式回填 keyOf(c)
    const kids = Array.isArray(children)
      ? children.map((c: any) =>
          c && typeof c === 'object' && c.type === Col
            ? h(Col, { ...c.props, key: keyOf(c), gutter }, c.props?.children)
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

export const Col: Component<ColProps> = async (_init, _ctx: UIContext) =>
  async (props) => {
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
