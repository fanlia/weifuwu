import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface FormProps {
  onSubmit?: () => void | Promise<void>
  children?: any
}

export const Form: Component<FormProps> = (_init, _ctx) =>
  (props) => {
  const { onSubmit, children } = props

  const handleSubmit = (e: Event) => {
    e.preventDefault()
    onSubmit?.()
  }

  return h('form', {
    class: 'wf-form',
    onSubmit: handleSubmit,
  }, children)
}
