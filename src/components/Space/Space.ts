/**
 * weifuwu/components — Space 间距容器
 *
 * 三库等价：antd Space / EP Space。flex gap 布局原语组件化：
 * size/direction/wrap/align + split 分隔符。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface SpaceProps {
  size?: number | 'sm' | 'md' | 'lg'
  direction?: 'horizontal' | 'vertical'
  wrap?: boolean
  align?: 'start' | 'center' | 'end' | 'baseline'
  split?: any
  children?: any
}

const SIZE_MAP: Record<string, string> = {
  sm: 'var(--wf-space-sm, 8px)',
  md: 'var(--wf-space-md, 16px)',
  lg: 'var(--wf-space-lg, 24px)',
}

export const Space: Component<SpaceProps> = async (_init, _ctx: WfuiContext) =>
  async (props) => {
    const { size = 'md', direction = 'horizontal', wrap, align, split, children } = props
    const gap = typeof size === 'number' ? `${size}px` : (SIZE_MAP[size] ?? 'var(--wf-space-md, 16px)')

    let kids: any[] = []
    if (Array.isArray(children)) {
      kids = children
      if (split !== undefined) {
        const withSplit: any[] = []
        children.forEach((c, i) => {
          if (i > 0) withSplit.push(h('span', { class: 'wf-space-split', key: `s${i}` }, split))
          withSplit.push(c)
        })
        kids = withSplit
      }
    } else if (children !== undefined) {
      kids = [children]
    }

    return h('div', {
      class: `wf-space${direction === 'vertical' ? ' wf-space--vertical' : ''}`,
      style: {
        gap,
        flexWrap: wrap ? 'wrap' : undefined,
        alignItems: align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : align,
      },
    }, kids)
  }
