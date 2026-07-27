import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface SliderProps {
  label?: string
  value?: number | string
  min?: number
  max?: number
  step?: number
  onChange?: (value: number) => void
}

export const Slider: Component<SliderProps> = (props, _ctx) => {
  const { label, value = 0, min = 0, max = 100, step = 1, onChange } = props

  const numVal = Number(value)

  const input = h('input', {
    type: 'range',
    class: 'wf-slider-input',
    value: numVal,
    min,
    max,
    step,
    onChange: onChange ? (e: Event) => onChange(Number((e.target as HTMLInputElement).value)) : undefined,
  })

  const display = h('span', { class: 'wf-slider-value' }, String(numVal))

  if (!label) return h('div', { class: 'wf-slider' }, [input, display])

  return h('div', { class: 'wf-slider-wrap' }, [
    h('label', { class: 'wf-slider-label' }, label),
    h('div', { class: 'wf-slider' }, [input, display]),
  ])
}
