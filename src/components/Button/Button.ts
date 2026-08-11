import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
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
  onClick?: (e: MouseEvent) => void
  children?: any
}

export const Button: Component<ButtonProps> = async (_init, ctx) =>
  async (props) => {
  const { variant = 'primary', size = 'md', block, loading, disabled, type, onClick, children } = props
  const cls = [
    'wf-btn',
    `wf-btn--${variant}`,
    `wf-btn--${size}`,
    block && 'wf-btn--block',
    loading && 'wf-btn--loading',
  ].filter(Boolean).join(' ')

  const L = (ctx as any)?.i18n?.components?.Button ?? {}

  return h('button', {
    id: props.id,
    class: cls,
    type: type ?? 'button',
    disabled: disabled || loading || undefined,
    'aria-busy': loading || undefined,
    onClick,
  }, loading
    ? [h('span', { class: 'wf-btn-spinner' }), L.loading ?? '加载中...']
    : children)

  }
