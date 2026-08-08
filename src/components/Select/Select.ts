import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  label?: string
  value?: string | string[]
  options?: SelectOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  error?: string
  onChange?: (value: string | string[]) => void
  children?: any
  /** 启用搜索过滤 */
  searchable?: boolean
  /** 多选模式（searchable 下生效；value/onChange 为数组） */
  multiple?: boolean
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
  $.highlight = -1

  return (props) => {
    const { label, value, options = [], placeholder, required, disabled, error, onChange, onSearch, multiple } = props

    // 多选：value 为数组
    const isMulti = !!multiple
    const values = isMulti ? (Array.isArray(value) ? value : []) : [value as string | undefined]

    // 本地过滤
    const filtered = $.keyword
      ? options.filter(o => o.label.toLowerCase().includes($.keyword.toLowerCase()))
      : options

    const displayOptions = $.keyword && onSearch && $.filteredOptions.length > 0
      ? $.filteredOptions
      : filtered

    const selectedOption = options.find(o => o.value === value)
    const selectedOptions = options.filter(o => values.includes(o.value))

    const handleInput = async (keyword: string) => {
      $.keyword = keyword
      $.open = true
      $.highlight = 0
      if (onSearch && keyword) {
        const result = await onSearch(keyword)
        if (result) $.filteredOptions = (result as SelectOption[])
      }
    }

    const handleSelect = (opt: SelectOption) => {
      if (opt.disabled) return
      if (isMulti) {
        const arr = Array.isArray(value) ? [...value] : []
        const i = arr.indexOf(opt.value)
        if (i >= 0) arr.splice(i, 1)
        else arr.push(opt.value)
        onChange?.(arr)
      } else {
        $.keyword = ''
        $.open = false
        onChange?.(opt.value)
      }
    }

    const removeValue = (v: string) => {
      if (!isMulti) return
      const arr = Array.isArray(value) ? [...value] : []
      onChange?.(arr.filter(x => x !== v))
    }

    const handleKeyDown = (e: any) => {
      if (disabled) return
      if (e.key === 'ArrowDown') {
        e.preventDefault(); $.open = true
        $.highlight = Math.min($.highlight + 1, displayOptions.length - 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); $.open = true
        $.highlight = Math.max($.highlight - 1, 0)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const opt = displayOptions[$.highlight]
        if (opt) handleSelect(opt)
      } else if (e.key === 'Escape') {
        e.preventDefault(); $.open = false; $.keyword = ''
      }
    }

    // 触发元素（多选：标签 + 输入框；单选：输入框）
    const tags = isMulti && selectedOptions.length > 0
      ? selectedOptions.map(o =>
          h('span', { class: 'wf-select-tag', key: o.value }, [
            o.label,
            h('button', {
              type: 'button',
              class: 'wf-select-tag-close',
              'aria-label': `移除 ${o.label}`,
              onClick: (ev: Event) => { ev.stopPropagation(); removeValue(o.value) },
            }, h(Icon, { name: 'close', size: 10 })),
          ])
        )
      : []

    const displayText = isMulti
      ? ''
      : $.open ? $.keyword : (selectedOption?.label ?? '')

    const trigger = h('div', {
      class: `wf-select-search-trigger${disabled ? ' wf-select-search--disabled' : ''}${error ? ' wf-select--err' : ''}`,
      onClick: disabled ? undefined : () => { $.open = !$.open },
    }, [
      ...tags,
      h('input', {
        class: 'wf-select-search-input',
        type: 'text',
        value: isMulti ? '' : ($.open ? $.keyword : (selectedOption?.label ?? '')),
        placeholder: selectedOptions.length > 0 ? undefined : (placeholder ?? ''),
        disabled,
        readOnly: !$.open || undefined,
        onInput: (e: any) => handleInput(e.target.value),
        onFocus: () => { if (!disabled) $.open = true },
        onBlur: () => { setTimeout(() => { $.open = false; $.keyword = '' }, 150) },
        onKeyDown: handleKeyDown,
      }),
    ])

    const wrapChildren: any[] = []

    if (label) {
      const labelContent: any[] = [label]
      if (required) labelContent.push(h('span', { class: 'wf-select-req' }, '*'))
      wrapChildren.push(h('label', { class: 'wf-select-label' }, labelContent))
    }

    // 选项面板
    const menuChildren = displayOptions.length > 0
      ? displayOptions.map((opt: SelectOption, i: number) => {
          const sel = isMulti
            ? values.includes(opt.value)
            : opt.value === value
          return h('div', {
            class: `wf-select-search-opt${sel ? ' wf-select-search-opt--sel' : ''}${opt.disabled ? ' wf-select-search-opt--dis' : ''}${$.highlight === i ? ' wf-select-search-opt--hl' : ''}`,
            key: opt.value,
            onMouseDown: (e: Event) => { e.preventDefault(); handleSelect(opt) },
          }, opt.label)
        })
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
