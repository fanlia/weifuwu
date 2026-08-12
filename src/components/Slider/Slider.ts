import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface SliderProps {
  label?: string
  value?: number | string
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onChange?: (value: number) => void
}

export const Slider: Component<SliderProps> = async (_init, _ctx) =>
  async (props) => {
  const { label, value = 0, min = 0, max = 100, step = 1, onChange, disabled } = props

  const numVal = Number(value)
  // 轨道进度填充：已滑过部分主色（webkit 用 background 渐变；Firefox 轨道透明由同渐变着色）
  const pct = max > min ? ((numVal - min) / (max - min)) * 100 : 0
  const trackBg = `linear-gradient(to right, var(--wf-color-primary) ${pct}%, var(--wf-color-border) ${pct}%)`

  const input = h('input', {
    type: 'range',
    class: ['wf-slider-input', disabled ? 'wf-slider-input--dis' : ''].filter(Boolean).join(' '),
    value: numVal,
    min,
    max,
    step,
    disabled: disabled || undefined,
    'aria-label': label,
    'aria-disabled': disabled ? 'true' : undefined,
    style: { background: trackBg },
    onChange: disabled || !onChange ? undefined : (e: Event) => onChange(Number((e.target as HTMLInputElement).value)),
  })

  const display = h('span', { class: 'wf-slider-value' }, String(numVal))

  if (!label) return h('div', { class: 'wf-slider' }, [input, display])

  return h('div', { class: 'wf-slider-wrap' }, [
    h('label', { class: 'wf-slider-label' }, label),
    h('div', { class: 'wf-slider' }, [input, display]),
  ])
}
