import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost'
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
  /** 透传 DOM id（测试定位/锚点） */
  id?: string
  /** 透传原生 class（覆盖默认 wf-btn 组合） */
  class?: string
  /** 透传无障碍标签（读屏/测试定位——按钮常仅图标无文本，name 缺失即死读屏路径） */
  'aria-label'?: string
  onClick?: (e: MouseEvent) => void
  children?: any
}

export const Button: Component<ButtonProps> = (_init, ctx) =>
  (props) => {
  const { variant = 'primary', size = 'md', block, loading, disabled, type, onClick, children } = props
  // CHAT-UX-PLAN 波次 1（C3 核心层修复）：合并透传 class（ButtonProps.class 曾声明
  // 「覆盖默认组合」但实现未消费——调用方响应式类（wf-hidden@lg 等）静默失效实证）
  const cls = [
    'wf-btn',
    `wf-btn--${variant}`,
    `wf-btn--${size}`,
    block && 'wf-btn--block',
    loading && 'wf-btn--loading',
    props.class,
  ].filter(Boolean).join(' ')

  const L = (ctx as any)?.i18n?.components?.Button ?? {}

  return h('button', {
    id: props.id,
    title: props.title,
    class: cls,
    type: type ?? 'button',
    disabled: disabled || loading || undefined,
    'aria-busy': loading || undefined,
    'aria-label': props['aria-label'],
    onClick,
  }, loading
    ? [h('span', { class: 'wf-btn-spinner' }), L.loading ?? '加载中...']
    : children)

  }
