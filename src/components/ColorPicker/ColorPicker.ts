import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Popover } from '../Popover/Popover.ts'

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
 * 裁剪：不做吸管/自由取色/透明度（预设色板 + hex 输入覆盖 90% 场景）。 */
export const ColorPicker: Component<ColorPickerProps> = (_init, _ctx) =>
  (props) => {
    const {
      value, onChange, colors = DEFAULT_COLORS,
      size = 'md', disabled, showInput, 'aria-label': ariaLabel,
    } = props

    const current = value ?? ''

    const swatches = colors.map(c =>
      h('button', {
        type: 'button',
        class: `wf-color-picker-swatch${c.toLowerCase() === current.toLowerCase() ? ' wf-color-picker-swatch--sel' : ''}`,
        style: { background: c },
        'aria-label': c,
        onClick: () => onChange?.(c),
      })
    )

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
          if (HEX_RE.test(raw)) onChange?.(raw)
        },
      }))
    }

    const panel = h('div', { class: 'wf-color-picker-panel' }, panelChildren)

    const trigger = h('button', {
      type: 'button',
      class: `wf-color-picker-trigger wf-color-picker-trigger--${size}`,
      'aria-label': ariaLabel ?? '选择颜色',
    }, [
      h('span', { class: 'wf-color-picker-swatch', style: { background: current || '#fff' } }),
      h('span', { class: 'wf-color-picker-value' }, current || '颜色'),
    ])

    return h(Popover, {
      content: panel,
      position: 'bottom',
      disabled,
    }, trigger)
  }
