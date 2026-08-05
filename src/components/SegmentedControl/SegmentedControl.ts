import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

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
export const SegmentedControl: Component<SegmentedControlProps> = (_init, _ctx) =>
  (props) => {
  const { options, value, onChange, size = 'md', block, ariaLabel } = props

  const cls = [
    'wf-segmented',
    size === 'sm' && 'wf-segmented--sm',
    block && 'wf-segmented--block',
  ].filter(Boolean).join(' ')

  return h('div', { class: cls, role: 'group', 'aria-label': ariaLabel },
    options.map(opt => h('button', {
      type: 'button',
      class: `wf-segmented-option${opt.value === value ? ' wf-segmented-option--active' : ''}`,
      'aria-pressed': opt.value === value ? 'true' : 'false',
      disabled: opt.disabled || undefined,
      onClick: opt.disabled ? undefined : () => onChange?.(opt.value),
    }, opt.label))
  )
}
