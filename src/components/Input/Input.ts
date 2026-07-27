import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, Fragment } from '../../client/vnode.ts'

export interface InputProps {
  label?: string
  type?: 'text' | 'email' | 'password' | 'number' | 'url'
  value?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  hint?: string
  showStepper?: boolean
  onInput?: (e: Event) => void
  onChange?: (e: Event) => void
}

export const Input: Component<InputProps> = (props, ctx) => {
  const { label, type = 'text', value, placeholder, required, disabled, error, hint, showStepper, onInput, onChange } = props

  const NL = type === 'number' && showStepper ? (ctx as any)?.i18n?.components?.InputNumber ?? {} : {}

  const inputEl = type === 'number' && showStepper
    ? h('div', { class: 'wf-input-number-wrap' }, [
        h('input', {
          class: 'wf-input',
          type,
          value: value ?? '',
          placeholder,
          required: required || undefined,
          disabled: disabled || undefined,
          onInput,
          onChange,
        }),
        h('div', { class: 'wf-input-number-stepper' }, [
          h('button', {
            class: 'wf-input-number-step',
            'aria-label': NL.increase ?? '增加',
            disabled: disabled || undefined,
            onClick: (e: MouseEvent) => {
              const input = (e.currentTarget as HTMLElement).parentElement!.previousElementSibling as HTMLInputElement
              if (input) {
                const step = parseFloat(input.getAttribute('step') || '1')
                const cur = parseFloat(input.value) || 0
                input.value = String(cur + step)
                input.dispatchEvent(new Event('input', { bubbles: true }))
              }
            },
          }, '▲'),
          h('button', {
            class: 'wf-input-number-step',
            'aria-label': NL.decrease ?? '减少',
            disabled: disabled || undefined,
            onClick: (e: MouseEvent) => {
              const input = (e.currentTarget as HTMLElement).parentElement!.previousElementSibling as HTMLInputElement
              if (input) {
                const step = parseFloat(input.getAttribute('step') || '1')
                const cur = parseFloat(input.value) || 0
                const min = parseFloat(input.getAttribute('min') || String(-Infinity))
                const val = cur - step
                if (val >= min || isNaN(min)) {
                  input.value = String(val)
                  input.dispatchEvent(new Event('input', { bubbles: true }))
                }
              }
            },
          }, '▼'),
        ]),
      ])
    : h('input', {
        class: 'wf-input',
        type,
        value: value ?? '',
        placeholder,
        required: required || undefined,
        disabled: disabled || undefined,
        onInput,
        onChange,
      })

  if (!label && !error && !hint) return inputEl

  const children: any[] = []

  if (label) {
    const labelContent: any[] = [label]
    if (required) labelContent.push(h('span', { class: 'wf-input-req' }, '*'))
    children.push(h('label', { class: 'wf-input-label' }, labelContent))
  }

  children.push(inputEl)

  if (error) children.push(h('div', { class: 'wf-input-err' }, error))
  if (hint && !error) children.push(h('div', { class: 'wf-input-hint' }, hint))

  return h('div', { class: `wf-input-wrap${error ? ' wf-input--err' : ''}` }, children)
}
