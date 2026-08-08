import type { Component } from '../../client/vnode.ts'
import { h } from '../../client/vnode.ts'
import { Checkbox } from '../Checkbox/Checkbox.ts'

export interface CheckboxGroupOption {
  value: string
  label: string
  desc?: string
  disabled?: boolean
}

export interface CheckboxGroupProps {
  options?: CheckboxGroupOption[]
  /** 受控选中值 */
  value?: string[]
  onChange?: (value: string[]) => void
  /** 栅格列数（1-4） */
  columns?: 1 | 2 | 3 | 4
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  /** 组标题（可选） */
  label?: string
  'aria-label'?: string
  className?: string
}

/** 复选框组/多选列表（对应 antd Checkbox.Group）：成员选择、多值字段 */
export const CheckboxGroup: Component<CheckboxGroupProps> = (_init) =>
  (props) => {
    const {
      options = [], value = [], onChange, columns,
      size = 'md', disabled, label, 'aria-label': ariaLabel, className,
    } = props

    const toggle = (v: string, checked: boolean) => {
      if (!onChange) return
      const next = checked
        ? [...new Set([...value, v])]
        : value.filter(x => x !== v)
      onChange(next)
    }

    const items = options.map(o =>
      h(Checkbox, {
        key: o.value,
        label: o.desc ? `${o.label}（${o.desc}）` : o.label,
        checked: value.includes(o.value),
        disabled: disabled || o.disabled,
        onChange: (checked: boolean) => toggle(o.value, checked),
      })
    )

    const children: any[] = []
    if (label) children.push(h('div', { class: 'wf-checkbox-group-label' }, label))
    children.push(...items)

    const classes = ['wf-checkbox-group', `wf-checkbox-group--${size}`]
    if (columns) classes.push(`wf-checkbox-group--cols-${columns}`)
    if (className) classes.push(className)

    return h('div', {
      class: classes.join(' '),
      role: 'group',
      'aria-label': ariaLabel || label || undefined,
    }, children)
  }
