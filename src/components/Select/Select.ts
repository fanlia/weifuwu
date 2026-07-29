import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  label?: string
  value?: string
  options?: SelectOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  onChange?: (value: string) => void
  children?: any
  /** 启用搜索过滤 */
  searchable?: boolean
  /** 异步搜索回调，返回值作为新选项列表 */
  onSearch?: (keyword: string) => SelectOption[] | Promise<SelectOption[]>
}

const SelectNative: Component<SelectProps> = (_init, _ctx) =>
  (props) => {
  const { label, value, options, placeholder, required, disabled, error, onChange, children } = props

  const optionEls: any[] = []
  if (placeholder) {
    optionEls.push(h('option', { value: '', disabled: true }, placeholder))
  }
  if (options) {
    for (const opt of options) {
      optionEls.push(h('option', { value: opt.value, disabled: opt.disabled }, opt.label))
    }
  }

  const selectEl = h('select', {
    class: 'wf-select',
    value: value ?? '',
    required: required || undefined,
    disabled: disabled || undefined,
    onChange: (e: any) => onChange?.(e.target.value),
  }, children ?? optionEls)

  const wrapChildren: any[] = []

  if (label) {
    const labelContent: any[] = [label]
    if (required) labelContent.push(h('span', { class: 'wf-select-req' }, '*'))
    wrapChildren.push(h('label', { class: 'wf-select-label' }, labelContent))
  }

  wrapChildren.push(selectEl)

  if (error) wrapChildren.push(h('div', { class: 'wf-select-err' }, error))

  return h('div', { class: `wf-select-wrap${error ? ' wf-select--err' : ''}` }, wrapChildren)
}

const SelectSearchable: Component<SelectProps> = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.open = false
  $.keyword = ''
  $.filteredOptions = [] as SelectOption[]

  return (props) => {
    const { label, value, options = [], placeholder, required, disabled, error, onChange, onSearch } = props

    // 本地过滤
    const filtered = $.keyword
      ? options.filter(o => o.label.toLowerCase().includes($.keyword.toLowerCase()))
      : options

    const selectedOption = options.find(o => o.value === value)

    const handleInput = async (keyword: string) => {
      $.keyword = keyword
      $.open = true
      if (onSearch && keyword) {
        const result = await onSearch(keyword)
        if (result) $.filteredOptions = (result as SelectOption[])
      }
    }

    const handleSelect = (opt: SelectOption) => {
      if (opt.disabled) return
      $.keyword = ''
      $.open = false
      onChange?.(opt.value)
    }

    // 触发元素
    const trigger = h('div', {
      class: `wf-select-search-trigger${disabled ? ' wf-select-search--disabled' : ''}${error ? ' wf-select--err' : ''}`,
      onClick: disabled ? undefined : () => { $.open = !$.open },
    }, [
      h('input', {
        class: 'wf-select-search-input',
        type: 'text',
        value: $.open ? $.keyword : (selectedOption?.label ?? ''),
        placeholder: selectedOption ? undefined : (placeholder ?? ''),
        disabled,
        readOnly: !$.open || undefined,
        onInput: (e: any) => handleInput(e.target.value),
        onFocus: () => { if (!disabled) $.open = true },
        onBlur: () => { setTimeout(() => { $.open = false; $.keyword = '' }, 150) },
      }),
    ])

    const wrapChildren: any[] = []

    if (label) {
      const labelContent: any[] = [label]
      if (required) labelContent.push(h('span', { class: 'wf-select-req' }, '*'))
      wrapChildren.push(h('label', { class: 'wf-select-label' }, labelContent))
    }

    // 选项面板
    const displayOptions = $.keyword && onSearch && $.filteredOptions.length > 0
      ? $.filteredOptions
      : filtered

    const menuChildren = displayOptions.length > 0
      ? displayOptions.map(opt =>
          h('div', {
            class: `wf-select-search-opt${opt.value === value ? ' wf-select-search-opt--sel' : ''}${opt.disabled ? ' wf-select-search-opt--dis' : ''}`,
            key: opt.value,
            onMouseDown: (e: Event) => { e.preventDefault(); handleSelect(opt) },
          }, opt.label)
        )
      : $.keyword
        ? [h('div', { class: 'wf-select-search-empty' }, '无匹配')]
        : []

    const menu = $.open
      ? h('div', { class: 'wf-select-search-menu' }, menuChildren)
      : null

    wrapChildren.push(h('div', { class: 'wf-select-search' }, [trigger, menu].filter(Boolean)))
    if (error) wrapChildren.push(h('div', { class: 'wf-select-err' }, error))

    return h('div', { class: `wf-select-wrap${error ? ' wf-select--err' : ''}` }, wrapChildren)
  }
}

export const Select: Component<SelectProps> = (_init, ctx) => {
  const nativeRender = SelectNative(_init, ctx)!
  const searchableRender = SelectSearchable(_init, ctx)!
  return (props) => props.searchable ? searchableRender(props) : nativeRender(props)
}
