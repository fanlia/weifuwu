import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface SearchInputProps {
  value?: string
  placeholder?: string
  onInput?: (e: Event) => void
  onClear?: () => void
}

export const SearchInput: Component<SearchInputProps> = (_init, _ctx) =>
  (props) => {
  const { value = '', placeholder = '搜索...', onInput, onClear } = props

  const clearBtn = value && onClear
    ? h('button', {
        class: 'wf-search-clear',
        type: 'button',
        onClick: onClear,
      }, '✕')
    : null

  const icon = h('span', { class: 'wf-search-icon' }, '🔍')

  return h('div', { class: 'wf-search' }, [
    icon,
    h('input', {
      class: 'wf-search-input',
      type: 'search',
      value,
      placeholder,
      onInput,
    }),
    clearBtn,
  ].filter(Boolean))
}
