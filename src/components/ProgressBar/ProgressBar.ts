import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface ProgressBarProps {
  value?: number
  max?: number
  label?: string
  showValue?: boolean
}

export const ProgressBar: Component<ProgressBarProps> = (_init, ctx) =>
  (props) => {
  const { value = 0, max = 100, label, showValue } = props

  const pct = Math.min(100, Math.max(0, (value / max) * 100))

  const PBL = (ctx as any)?.i18n?.components?.ProgressBar ?? {}
  const bar = h('div', {
    class: 'wf-progress',
    role: 'progressbar',
    'aria-valuenow': Math.round(value),
    'aria-valuemin': 0,
    'aria-valuemax': Math.round(max),
    'aria-label': label ?? (PBL.ariaLabel ?? '进度'),
  }, [
    h('div', {
      class: 'wf-progress-fill',
      style: { width: `${pct}%` },
    }),
  ])

  if (!label && !showValue) return bar

  const parts: any[] = []

  if (label) parts.push(h('span', { class: 'wf-progress-label' }, label))
  parts.push(bar)
  if (showValue) parts.push(h('span', { class: 'wf-progress-value' }, `${Math.round(pct)}%`))

  return h('div', { class: 'wf-progress-wrap' }, parts)

  }
