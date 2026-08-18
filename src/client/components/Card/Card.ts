import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface CardProps {
  variant?: 'default' | 'outlined'
  /** 便捷：outlined = variant 'outlined' */
  outlined?: boolean
  padding?: 'sm' | 'md' | 'lg'
  clickable?: boolean
  /** hover 抬升（阴影 + 上移），适合可点击/可悬停的卡片 */
  hover?: boolean
  /** 选中态（边框高亮 + 品牌浅底），适合选择卡片 */
  active?: boolean
  onClick?: () => void
  className?: string
  /** id 属性（锚点定位——AgentDetail Tab 导航用） */
  id?: string
  style?: Record<string, string>
  children?: any
}

export const Card: Component<CardProps> = async (_init, _ctx) =>
  async (props) => {
  const { variant = 'default', padding = 'md', clickable, hover, active, onClick, className, id, style, children } = props

  const cls = [
    'wf-card',
    `wf-card--${variant}`,
    `wf-card--pad-${padding}`,
    clickable && 'wf-card--clickable',
    hover && 'wf-card--hover',
    active && 'wf-card--active',
    (clickable || hover) && 'wf-elevate', // hover 抬升（阴影+上移）共用原语
  ].filter(Boolean).join(' ')

  return h('div', {
    class: className ? `${cls} ${className}` : cls,
    id,
    style,
    onClick,
    role: clickable ? 'button' : undefined,
    tabindex: clickable ? 0 : undefined,
    // 可点击卡片 = role=button，Enter/Space 必须可操作（键盘可达红线）
    onKeyDown: clickable
      ? (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick?.()
          }
        }
      : undefined,
  }, children)
}
