import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
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
  /** 允许半星（0.5 精度；点击左半=半星，右半=整星） */
  allowHalf?: boolean
  'aria-label'?: string
}

export const Rate: Component<RateProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let hover = -1 // -1 = 未悬停；键盘悬停态复用（聚焦跟随）
  // 手动状态纪律（§4.1）：hover 是手动 UI 状态——变更必须显式 render，
  // 否则 effective = hover + 1 的预览是死代码（hover/focus 预览不落地）
  const setHover = (v: number) => {
    if (hover === v) return
    hover = v
    ctx.render()
  }

  return (props) => {
    const {
      count = 5, size = 'md',
      readOnly, disabled, allowClear, allowHalf, 'aria-label': ariaLabel,
    } = props

    // useControlled：受控/非受控统一（缺回调 warn + 非受控内部态——
    // 原实现非受控（无 onChange）静默不可点，受控纪律违规）
    // readOnly/disabled 不可交互——value 是展示态非受控态，豁免 warn（demo 静态展示触发误报）
    const inert = readOnly || disabled
    const ctrl = ctx?.ui?.useControlled<number>({ value: props.value, onChange: props.onChange, name: inert ? undefined : 'Rate' })
    const value = ctrl?.value ?? 0
    const setRate = (v: number) => {
      const wasControlled = ctrl?.controlled?.value !== undefined
      ctrl?.setValue(v)
      // onChange 通知语义（非受控也调）；受控时 setValue 已调
      if (!wasControlled) props.onChange?.(v)
    }

    const interactive = !readOnly && !disabled
    const effective = hover >= 0 ? hover + 1 : value
    const step = allowHalf ? 0.5 : 1

    const handleKeyDown = (e: any) => {
      if (!interactive) return
      const key = e.key
      if (key === 'ArrowRight') { e.preventDefault(); setRate(Math.min(value + step, count)) }
      else if (key === 'ArrowLeft') { e.preventDefault(); setRate(Math.max(value - step, 0)) }
      else if (key === 'Home') { e.preventDefault(); setRate(step) }
      else if (key === 'End') { e.preventDefault(); setRate(count) }
    }

    const stars: any[] = []
    for (let i = 0; i < count; i++) {
      const full = i < Math.floor(effective)
      const half = allowHalf && i === Math.floor(effective) && effective % 1 >= 0.5
      const on = full
      const starProps: Record<string, any> = {
        class: `wf-rate-star${on ? ' wf-rate-star--on' : ''}${half ? ' wf-rate-star--half' : ''}`,
        'aria-label': `${i + 1} 星`,
        key: i,
      }
      if (interactive) {
        starProps.type = 'button'
        starProps.onClick = (e: MouseEvent) => {
          if (allowHalf) {
            // 左半=半星，右半=整星（按点击位置相对元素宽）
            const el = e.currentTarget as HTMLElement
            const rect = el.getBoundingClientRect()
            const isLeft = (e.clientX - rect.left) < rect.width / 2
            setRate(isLeft ? i + 0.5 : i + 1)
          } else {
            if (allowClear && value === i + 1) setRate(0)
            else setRate(i + 1)
          }
        }
        starProps.onMouseEnter = allowHalf
          ? (e: MouseEvent) => {
              const el = e.currentTarget as HTMLElement
              const rect = el.getBoundingClientRect()
              setHover((e.clientX - rect.left) < rect.width / 2 ? i + 0.5 - 1 : i)
            }
          : () => setHover(i)
        starProps.onMouseMove = allowHalf
          ? (e: MouseEvent) => {
              const el = e.currentTarget as HTMLElement
              const rect = el.getBoundingClientRect()
              setHover((e.clientX - rect.left) < rect.width / 2 ? i + 0.5 - 1 : i)
            }
          : undefined
        starProps.onMouseLeave = () => setHover(-1)
        starProps.onFocus = () => setHover(i)
        starProps.onBlur = () => setHover(-1)
      }
      const icon = h(Icon, { name: 'star', className: 'wf-rate-star-icon' })
      // 半星：底层空星轮廓 + 上层满星裁剪左半（0.5em 精确裁剪）
      const inner = half
        ? h('span', { class: 'wf-rate-star-half' }, [
            h('span', { class: 'wf-rate-star-half-bg' }, icon),
            h('span', { class: 'wf-rate-star-half-fg' }, h(Icon, { name: 'star', className: 'wf-rate-star-icon' })),
          ])
        : icon
      stars.push(h(interactive ? 'button' : 'span', starProps, inner))
    }

    return h('div', {
      class: `wf-rate wf-rate--${size}${disabled ? ' wf-rate--disabled' : ''}`,
      role: interactive ? 'radiogroup' : undefined,
      'aria-label': ariaLabel ?? '评分',
      onKeyDown: interactive ? handleKeyDown : undefined,
    }, stars)
  }
}
