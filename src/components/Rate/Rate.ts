import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface RateProps {
  /** 当前评分值（0..count） */
  value?: number
  onChange?: (value: number) => void
  /** 星星总数，默认 5 */
  count?: number
  size?: 'sm' | 'md' | 'lg'
  /** 只读（展示态，不可交互、不可聚焦） */
  readOnly?: boolean
  disabled?: boolean
  /** 点击当前评分值 → 清除为 0（antd 对齐） */
  allowClear?: boolean
  'aria-label'?: string
}

export const Rate: Component<RateProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let hover = -1 // -1 = 未悬停；键盘悬停态复用（聚焦跟随）

  return (props) => {
    const {
      value = 0, onChange, count = 5, size = 'md',
      readOnly, disabled, allowClear, 'aria-label': ariaLabel,
    } = props

    const interactive = !readOnly && !disabled
    const effective = hover >= 0 ? hover + 1 : value

    const handleKeyDown = (e: any) => {
      if (!interactive || !onChange) return
      const key = e.key
      if (key === 'ArrowRight') { e.preventDefault(); onChange(Math.min(value + 1, count)) }
      else if (key === 'ArrowLeft') { e.preventDefault(); onChange(Math.max(value - 1, 0)) }
      else if (key === 'Home') { e.preventDefault(); onChange(1) }
      else if (key === 'End') { e.preventDefault(); onChange(count) }
    }

    const stars: any[] = []
    for (let i = 0; i < count; i++) {
      const on = i < effective
      const starProps: Record<string, any> = {
        class: `wf-rate-star${on ? ' wf-rate-star--on' : ''}`,
        'aria-label': `${i + 1} 星`,
        key: i,
      }
      if (interactive) {
        starProps.type = 'button'
        starProps.onClick = () => {
          if (!onChange) return
          if (allowClear && value === i + 1) onChange(0)
          else onChange(i + 1)
        }
        starProps.onMouseEnter = () => { hover = i }
        starProps.onMouseLeave = () => { hover = -1 }
        starProps.onFocus = () => { hover = i }
        starProps.onBlur = () => { hover = -1 }
      }
      stars.push(h(interactive ? 'button' : 'span', starProps, h(Icon, { name: 'star', className: 'wf-rate-star-icon' })))
    }

    return h('div', {
      class: `wf-rate wf-rate--${size}${disabled ? ' wf-rate--disabled' : ''}`,
      role: interactive ? 'radiogroup' : undefined,
      'aria-label': ariaLabel ?? '评分',
      onKeyDown: interactive ? handleKeyDown : undefined,
    }, stars)
  }
}
