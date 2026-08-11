import type { Component } from '../../ui-dom/vnode.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface LabelProps {
  htmlFor?: string
  /** 必填星号 */
  required?: boolean
  children?: any
  className?: string
  [key: string]: any
}

/** 独立标签（对应 shadcn Label；weifuwu Input/Field 已内嵌 label，独立组件用于自定义布局） */
export const Label: Component<LabelProps> = async (_init) =>
  (props) => {
    const { htmlFor, required, children, className, ...rest } = props
    const content = required
      ? [children, h('span', { class: 'wf-label-req' }, '*')]
      : children
    return h('label', {
      class: ['wf-label', className].filter(Boolean).join(' '),
      htmlFor: htmlFor || undefined,
      ...rest,
    }, content)
  }
