import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface ProgressBarProps {
  /** 进度值；undefined = indeterminate（不确定态，动画扫动） */
  value?: number
  max?: number
  label?: string
  showValue?: boolean
  /** 状态色（default/success/error/warning） */
  status?: 'default' | 'success' | 'error' | 'warning'
  /** 尺寸 */
  size?: 'sm' | 'md' | 'lg'
}

export const ProgressBar: Component<ProgressBarProps> = (_init, ctx) =>
  (props) => {
  const { value, max = 100, label, showValue, status = 'default', size = 'md' } = props

  const indeterminate = value == null
  const pct = indeterminate ? 0 : Math.min(100, Math.max(0, (value / max) * 100))

  const PBL = (ctx as any)?.i18n?.components?.ProgressBar ?? {}
  const bar = h('div', {
    class: `wf-progress wf-progress--${size}${indeterminate ? ' wf-progress--indeterminate' : ''}${status !== 'default' ? ` wf-progress--${status}` : ''}`,
    role: 'progressbar',
    'aria-valuenow': indeterminate ? undefined : Math.round(value),
    'aria-valuemin': 0,
    'aria-valuemax': Math.round(max),
    'aria-label': label ?? (PBL.ariaLabel ?? '进度'),
  }, [
    h('div', {
      class: `wf-progress-fill${status !== 'default' ? ` wf-progress-fill--${status}` : ''}`,
      style: indeterminate ? undefined : { width: `${pct}%` },
    }),
  ])

  if (!label && !showValue) return bar

  const parts: any[] = []

  if (label) parts.push(h('span', { class: 'wf-progress-label' }, label))
  parts.push(bar)
  if (showValue && !indeterminate) parts.push(h('span', { class: 'wf-progress-value' }, `${Math.round(pct)}%`))

  return h('div', { class: 'wf-progress-wrap' }, parts)

  }
