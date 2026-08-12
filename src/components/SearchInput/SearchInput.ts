import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface SearchInputProps {
  value?: string
  placeholder?: string
  disabled?: boolean
  onInput?: (e: Event) => void
  onClear?: () => void
}

export const SearchInput: Component<SearchInputProps> = async (_init, _ctx) =>
  async (props) => {
  const { value = '', placeholder = '搜索...', onInput, onClear, disabled } = props

  const clearBtn = value && onClear
    ? h('button', {
        class: 'wf-search-clear',
        type: 'button',
        'aria-label': '清除',
        onClick: onClear,
      }, h(Icon, { name: 'close' }))
    : null

  const icon = h('span', { class: 'wf-search-icon' }, h(Icon, { name: 'search' }))

  return h('div', { class: 'wf-search' }, [
    icon,
    h('input', {
      class: ['wf-search-input', disabled ? 'wf-search-input--dis' : ''].filter(Boolean).join(' '),
      type: 'search',
      value,
      placeholder,
      disabled: disabled || undefined,
      'aria-disabled': disabled ? 'true' : undefined,
      onInput,
    }),
    clearBtn,
  ].filter(Boolean))
}
