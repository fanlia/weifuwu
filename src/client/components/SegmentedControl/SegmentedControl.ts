import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface SegmentedOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SegmentedControlProps {
  /** 选项列表（label 可为字符串或任意 VNode） */
  options: SegmentedOption[]
  /** 当前选中值 */
  value?: string
  onChange?: (value: string) => void
  size?: 'sm' | 'md'
  /** 撑满父容器宽度（选项等分） */
  block?: boolean
  ariaLabel?: string
}

/**
 * 分段控件 — 单选切换（模式切换 / 状态筛选 / 模板选择）
 * 语义：toggle group（aria-pressed），键盘 focus-visible 可见
 */
export const SegmentedControl: Component<SegmentedControlProps> = (_init, ctx) =>
  (props) => {
  const { options, size = 'md', block, ariaLabel } = props

  // useControlled：受控/非受控统一（原非受控静默不可点——受控纪律违规）
  const ctrl = ctx?.ui?.useControlled<string>({ value: props.value, onChange: props.onChange, name: 'SegmentedControl' })
  const select = (v: string) => {
    const wasControlled = ctrl?.controlled?.value !== undefined
    ctrl?.setValue(v)
    if (!wasControlled) props.onChange?.(v)
  }

  const cls = [
    'wf-segmented',
    size === 'sm' && 'wf-segmented--sm',
    block && 'wf-segmented--block',
  ].filter(Boolean).join(' ')

  return h('div', { class: cls, role: 'group', 'aria-label': ariaLabel },
    options.map(opt => h('button', {
      type: 'button',
      key: opt.value, // 选项身份（选项增删/重排——keyed diff move）
      class: `wf-segmented-option${opt.value === ctrl?.value ? ' wf-segmented-option--active' : ''}`,
      'aria-pressed': opt.value === ctrl?.value ? 'true' : 'false',
      disabled: opt.disabled || undefined,
      onClick: opt.disabled ? undefined : () => select(opt.value),
    }, opt.label))
  )
}
