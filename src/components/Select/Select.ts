import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

/** 选项组（optgroup）：label + 组内选项 */
export interface SelectOptionGroup {
  label: string
  options: SelectOption[]
}

/** 选项列表：平铺项与分组可混用 */
export type SelectOptions = (SelectOption | SelectOptionGroup)[]

export function isOptionGroup(o: SelectOption | SelectOptionGroup): o is SelectOptionGroup {
  return 'options' in o && !('value' in o)
}

/** 展平（键盘索引 / 选中查找用）；保持顺序 */
export function flattenOptions(opts: SelectOptions | undefined): SelectOption[] {
  if (!opts) return []
  return opts.flatMap((o) => (isOptionGroup(o) ? o.options : [o]))
}

export interface SelectProps {
  label?: string
  value?: string | string[]
  options?: SelectOptions
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
      if (isOptionGroup(opt)) {
        // 分组 → 原生 optgroup（组标题不可选，子项 option）
        optionEls.push(h('optgroup', { label: opt.label }, opt.options.map((o) => h('option', { value: o.value, disabled: o.disabled }, o.label))))
      } else {
        optionEls.push(h('option', { value: opt.value, disabled: opt.disabled }, opt.label))
      }
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
  // 卸载保护：blur 延迟关闭等异步回调不再触发（防孤儿 Proxy 赋值）
  let disposed = false
  let blurTimer: ReturnType<typeof setTimeout> | undefined
  ctx.ui.useStableRef?.(() => {}, () => { disposed = true; if (blurTimer) clearTimeout(blurTimer) })
  $.open = false
  $.keyword = ''
  $.filteredOptions = [] as SelectOption[]
  $.highlight = -1

  // 弹层纪律（AGENTS.md）：menu 必须 portal——此前 absolute 会被父容器
  // overflow/transform 裁剪（AutoComplete 同款教训）。usePopup 提供
  // portal + 定位 + 外部点击 + Escape + 锚点感知。
  let triggerEl: HTMLElement | null = null
  let inputEl: HTMLInputElement | null = null
  const triggerRef = (el: HTMLElement | null) => { if (el) triggerEl = el }
  // 稳定 ref：trigger 点击聚焦 input（用户点击 Select 应有输入光标）
  const searchInputRef = (el: HTMLInputElement | null) => { if (el) inputEl = el }
  const popup = ctx.ui.usePopup({
    trigger: () => 'click',
    placement: () => 'bottom',
    center: false, // 左对齐 trigger
    gap: 4,
    el: () => triggerEl,
    isOpen: () => $.open,
    setOpen: (v) => { $.open = v },
  })

  return (props) => {
    const { label, value, options = [], placeholder, required, disabled, error, onChange, onSearch, multiple } = props

    // 多选：value 为数组
    const isMulti = !!multiple
    const values = isMulti ? (Array.isArray(value) ? value : []) : [value as string | undefined]

    // 本地过滤（组感知：组内项按 label 匹配，空组隐藏；平铺项直接匹配）
    const filterGrouped = (opts: SelectOptions, kw: string): SelectOptions => {
      if (!kw) return opts
      const lower = kw.toLowerCase()
      return opts.flatMap((o): (SelectOption | SelectOptionGroup)[] => {
        if (isOptionGroup(o)) {
          const kids = o.options.filter((x) => x.label.toLowerCase().includes(lower))
          return kids.length ? [{ label: o.label, options: kids }] : []
        }
        return o.label.toLowerCase().includes(lower) ? [o] : []
      })
    }

    const displayGrouped = $.keyword && onSearch && $.filteredOptions.length > 0
      ? $.filteredOptions as SelectOptions
      : filterGrouped(options as SelectOptions, $.keyword)

    // flatten 供键盘索引 / 选中查找（跨组连续计数）
    const displayOptions = flattenOptions(displayGrouped)

    const flatAll = flattenOptions(options)
    const selectedOption = flatAll.find(o => o.value === value)
    const selectedOptions = flatAll.filter(o => values.includes(o.value))

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
      // key 稳定：portal 开关致数组长度变化——无 key trigger 会被重建 → input 焦点丢失
      key: 'select-trigger',
      class: `wf-select-search-trigger${disabled ? ' wf-select-search--disabled' : ''}${error ? ' wf-select--err' : ''}`,
      ref: triggerRef,
      role: 'combobox',
      'aria-haspopup': 'listbox',
      'aria-expanded': String($.open),
      // 只开不关（toggle 与 input focus 冲突：点击 input 区域 focus 开→click toggle 关
      // ——'先弹出后自动关闭'根因）。关闭走：外部点击（usePopup）/Escape/选中（handleSelect）
      onClick: disabled ? undefined : () => {
        $.open = true
        inputEl?.focus() // 点击 Select → 输入框聚焦（光标 + focus 样式）
      },
    }, [
      ...tags,
      h('input', {
        // key 稳定：无 key 数组子节点每次渲染重建 → input 焦点丢失（受控输入纪律）
        key: 'select-search-input',
        ref: searchInputRef,
        class: 'wf-select-search-input',
        type: 'text',
        value: isMulti ? '' : ($.open ? $.keyword : (selectedOption?.label ?? '')),
        placeholder: selectedOptions.length > 0 ? undefined : (placeholder ?? ''),
        disabled,
        readOnly: !$.open || undefined,
        onInput: (e: any) => handleInput(e.target.value),
        onFocus: () => { if (!disabled) $.open = true },
        onBlur: () => { blurTimer = setTimeout(() => { if (!disposed) { $.open = false; $.keyword = '' } }, 150) },
        onKeyDown: handleKeyDown,
      }),
    ])

    const wrapChildren: any[] = []

    if (label) {
      const labelContent: any[] = [label]
      if (required) labelContent.push(h('span', { class: 'wf-select-req' }, '*'))
      wrapChildren.push(h('label', { class: 'wf-select-label' }, labelContent))
    }

    // 选项面板（组感知：组头 + 组内选项；flatten 索引连续——键盘高亮跨组正确）
    let flatIdx = 0
    const renderOpt = (opt: SelectOption, i: number) => {
      const sel = isMulti
        ? values.includes(opt.value)
        : opt.value === value
      const node = h('div', {
        class: `wf-select-search-opt${sel ? ' wf-select-search-opt--sel' : ''}${opt.disabled ? ' wf-select-search-opt--dis' : ''}${$.highlight === i ? ' wf-select-search-opt--hl' : ''}`,
        key: opt.value,
        onMouseDown: (e: Event) => { e.preventDefault(); handleSelect(opt) },
      }, opt.label)
      flatIdx++
      return node
    }

    // 显式 push 扁平数组（map 产生嵌套数组 children——渲染器不展开嵌套数组）
    const menuChildren: any[] = []
    if (displayOptions.length > 0) {
      for (const item of displayGrouped) {
        if (isOptionGroup(item)) {
          menuChildren.push(h('div', { class: 'wf-select-search-group', key: `group-${item.label}` }, item.label))
          for (const opt of item.options) menuChildren.push(renderOpt(opt, flatIdx))
        } else {
          menuChildren.push(renderOpt(item, flatIdx))
        }
      }
    } else if ($.keyword) {
      menuChildren.push(h('div', { class: 'wf-select-search-empty' }, '无匹配'))
    }

    const menu = h('div', { class: 'wf-select-search-menu' }, menuChildren)

    wrapChildren.push(h('div', { class: 'wf-select-search' }, [trigger, popup.portal(menu, 'wf-select-menu')].filter(Boolean)))
    if (error) wrapChildren.push(h('div', { class: 'wf-select-err' }, error))

    return h('div', { class: `wf-select-wrap${error ? ' wf-select--err' : ''}` }, wrapChildren)
  }
}

export const Select: Component<SelectProps> = async (_init, ctx) => {
  const nativeRender = SelectNative(_init, ctx) as (props: SelectProps) => any
  const searchableRender = SelectSearchable(_init, ctx) as (props: SelectProps) => any
  return (props) => props.searchable ? searchableRender(props) : nativeRender(props)
}
