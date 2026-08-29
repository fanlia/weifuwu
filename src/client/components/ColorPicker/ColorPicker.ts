import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Popover } from '../Popover/Popover.ts'
import { Icon } from '../Icon/Icon.ts'

export interface ColorPickerProps {
  /** 受控颜色值（hex，如 #4f6ef7） */
  value?: string
  onChange?: (value: string) => void
  /** 预设色板（默认内置 10 色） */
  colors?: string[]
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  /** 显示 hex 输入框（自由输入） */
  showInput?: boolean
  'aria-label'?: string
}

const DEFAULT_COLORS = [
  '#4f6ef7', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
  '#22c55e', '#14b8a6', '#06b6d4', '#64748b', '#1e293b',
]

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** 颜色选择（对应 antd/EP ColorPicker 预设版）：触发按钮 + 色板弹层 + hex 输入。
 * 裁剪（CS-05，见 design/components-cuts.md）：不做吸管/自由取色/透明度（预设色板 + hex 输入覆盖 90% 场景）。 */
export const ColorPicker: Component<ColorPickerProps> = (_init, ctx) => {
  // mount 层：弹层 open 状态（aria-expanded 联动 + 受控 Popover）
  let open = false
  return (props) => {
    const {
      colors = DEFAULT_COLORS,
      size = 'md', disabled, showInput, 'aria-label': ariaLabel,
    } = props

    // useControlled：受控/非受控统一（原非受控不可选色——受控纪律违规）
    const ctrl = ctx?.ui?.useControlled<string>({ value: props.value, onChange: props.onChange, name: 'ColorPicker' })
    const select = (v: string) => {
      const wasControlled = ctrl?.controlled?.value !== undefined
      ctrl?.setValue(v)
      if (!wasControlled) props.onChange?.(v)
    }
    const current = ctrl?.value ?? ''

    const swatches = colors.map(c => {
      const sel = c.toLowerCase() === current.toLowerCase()
      return h('button', {
        type: 'button',
        class: `wf-color-picker-swatch${sel ? ' wf-color-picker-swatch--sel' : ''}`,
        style: { background: c },
        'aria-label': c,
        'aria-pressed': sel ? 'true' : 'false',
        onClick: () => select(c),
      }, sel ? h(Icon, { name: 'check', size: 14, className: 'wf-color-picker-check' }) : null)
    })

    const panelChildren: any[] = [h('div', { class: 'wf-color-picker-grid' }, swatches)]

    if (showInput) {
      panelChildren.push(h('input', {
        class: 'wf-color-picker-input',
        type: 'text',
        value: current,
        placeholder: '#4f6ef7',
        spellcheck: 'false',
        onInput: (e: any) => {
          const raw = e.target.value.trim()
          if (HEX_RE.test(raw)) select(raw)
        },
      }))
    }

    const panel = h('div', { class: 'wf-color-picker-panel' }, panelChildren)

    const trigger = h('button', {
      type: 'button',
      class: `wf-color-picker-trigger wf-color-picker-trigger--${size}${disabled ? ' wf-color-picker-trigger--disabled' : ''}`,
      disabled,
      'aria-label': ariaLabel ?? '选择颜色',
      'aria-disabled': disabled ? 'true' : undefined,
      'aria-haspopup': 'dialog',
      'aria-expanded': open ? 'true' : 'false',
    }, [
      h('span', { class: 'wf-color-picker-swatch', style: { background: current || '#fff' } }),
      h('span', { class: 'wf-color-picker-value' }, current || '颜色'),
    ])

    return h(Popover, {
      content: panel,
      position: 'bottom',
      disabled,
      open,
      onOpenChange: (o: boolean) => { open = o; ctx.render() },
    }, trigger)
  }
}
