import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface SliderProps {
  label?: string
  value?: number | string
  min?: number
  max?: number
  step?: number
  onChange?: (value: number) => void
}

export const Slider: Component<SliderProps> = (_init, _ctx) =>
  (props) => {
  const { label, value = 0, min = 0, max = 100, step = 1, onChange } = props

  const numVal = Number(value)
  // 轨道进度填充：已滑过部分主色（webkit 用 background 渐变；Firefox 轨道透明由同渐变着色）
  const pct = max > min ? ((numVal - min) / (max - min)) * 100 : 0
  const trackBg = `linear-gradient(to right, var(--wf-color-primary) ${pct}%, var(--wf-color-border) ${pct}%)`

  const input = h('input', {
    type: 'range',
    class: 'wf-slider-input',
    value: numVal,
    min,
    max,
    step,
    'aria-label': label,
    style: { background: trackBg },
    onChange: onChange ? (e: Event) => onChange(Number((e.target as HTMLInputElement).value)) : undefined,
  })

  const display = h('span', { class: 'wf-slider-value' }, String(numVal))

  if (!label) return h('div', { class: 'wf-slider' }, [input, display])

  return h('div', { class: 'wf-slider-wrap' }, [
    h('label', { class: 'wf-slider-label' }, label),
    h('div', { class: 'wf-slider' }, [input, display]),
  ])
}
