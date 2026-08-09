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
      count = 5, size = 'md',
      readOnly, disabled, allowClear, 'aria-label': ariaLabel,
    } = props

    // useControlled：受控/非受控统一（缺回调 warn + 非受控内部态——
    // 原实现非受控（无 onChange）静默不可点，受控纪律违规）
    // readOnly/disabled 不可交互——value 是展示态非受控态，豁免 warn（demo 静态展示触发误报）
    const inert = readOnly || disabled
    const ctrl = ctx?.ui?.useControlled<number>({ value: props.value, onChange: props.onChange, name: inert ? undefined : 'Rate' })
    const value = ctrl?.value ?? 0
    const setRate = (v: number) => {
      const wasControlled = ctrl?.controlled
      ctrl?.setValue(v)
      // onChange 通知语义（非受控也调）；受控时 setValue 已调
      if (!wasControlled) props.onChange?.(v)
    }

    const interactive = !readOnly && !disabled
    const effective = hover >= 0 ? hover + 1 : value

    const handleKeyDown = (e: any) => {
      if (!interactive) return
      const key = e.key
      if (key === 'ArrowRight') { e.preventDefault(); setRate(Math.min(value + 1, count)) }
      else if (key === 'ArrowLeft') { e.preventDefault(); setRate(Math.max(value - 1, 0)) }
      else if (key === 'Home') { e.preventDefault(); setRate(1) }
      else if (key === 'End') { e.preventDefault(); setRate(count) }
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
          if (allowClear && value === i + 1) setRate(0)
          else setRate(i + 1)
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
