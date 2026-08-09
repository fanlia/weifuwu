/**
 * weifuwu/components — AutoComplete 输入联想
 *
 * 三库等价：antd AutoComplete / EP Autocomplete / shadcn Combobox（输入侧）。
 * 自由输入 + 实时联想下拉：包含匹配（不区分大小写）、键盘 ↓↑/Enter/Escape、
 * 选中回填。与 Select 区别：Select 选固定选项，AutoComplete 输入是自由值。
 *
 *   <AutoComplete
 *     options={[{ value: 'pay', label: '支付平台' }]}
 *     value={query} onChange={setQuery}
 *   />
 *
 * 裁剪（CS-05）：不做分组/虚拟化候选（Select searchable 覆盖分组场景）；
 * 自定义渲染用 `renderOption` 透传。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface AutoCompleteOption {
  value: string
  label?: any
  disabled?: boolean
}

export interface AutoCompleteProps {
  options: AutoCompleteOption[]
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
  /** 过滤函数（默认包含匹配） */
  filter?: (options: AutoCompleteOption[], query: string) => AutoCompleteOption[]
  renderOption?: (option: AutoCompleteOption) => any
  onSelect?: (value: string, option: AutoCompleteOption) => void
}

/** 默认过滤：label/value 包含匹配，不区分大小写（纯函数——可单测/SSR） */
export function filterOptions(options: AutoCompleteOption[], query: string): AutoCompleteOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter(o => {
    const label = String(o.label ?? o.value).toLowerCase()
    return label.includes(q) || o.value.toLowerCase().includes(q)
  })
}

export const AutoComplete: Component<AutoCompleteProps> = (_init, ctx: WfuiContext) => {
  // ── mount（只一次）──
  let open = _init?.open ?? false
  let activeIndex = -1
  let latestValue = _init?.value ?? ''
  let latestOnChange: ((v: string) => void) | undefined
  let latestOpen: boolean | undefined = _init?.open
  let latestOnOpenChange: ((v: boolean) => void) | undefined
  let latestOnSelect: ((v: string, o: AutoCompleteOption) => void) | undefined
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  const pos = ctx.ui.usePopupPosition({
    el: () => wrapEl,
    isOpen: () => open,
    compute: (r) => ({ top: r.bottom + 4, left: r.left, width: r.width }),
  })

  const setOpen = (v: boolean) => {
    open = v
    latestOnOpenChange?.(v)
    ctx.ui.render()
  }

  const pick = (option: AutoCompleteOption) => {
    latestOnChange?.(option.value)
    latestOnSelect?.(option.value, option)
    activeIndex = -1
    setOpen(false)
  }

  // ── render（每次 dirty/props 变化）──
  return (props: AutoCompleteProps) => {
    const { options, value, placeholder = '输入搜索…', disabled, renderOption, onSelect } = props
    latestValue = value ?? ''
    latestOnChange = props.onChange
    latestOpen = props.open
    latestOnOpenChange = props.onOpenChange
    latestOnSelect = onSelect
    if (props.open !== undefined) open = !!props.open

    const query = latestValue
    const filtered = (props.filter ?? filterOptions)(options, query)
    if (activeIndex >= filtered.length) activeIndex = -1

    const onInput = (e: any) => {
      const v = e.target.value
      latestOnChange?.(v)
      if (!open) setOpen(true)
      activeIndex = -1
    }

    const onKeyDown = (e: any) => {
      if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault()
        setOpen(true)
        activeIndex = e.key === 'ArrowDown' ? 0 : filtered.length - 1
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        activeIndex = (activeIndex + 1) % filtered.length
        ctx.ui.render()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        activeIndex = activeIndex <= 0 ? filtered.length - 1 : activeIndex - 1
        ctx.ui.render()
      } else if (e.key === 'Enter') {
        if (open && activeIndex >= 0 && filtered[activeIndex]) {
          e.preventDefault()
          pick(filtered[activeIndex])
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
      }
    }

    const dropdown = h('div', {
      class: 'wf-autocomplete-dropdown',
      style: { top: pos.top + 'px', left: pos.left + 'px', width: (pos.width ?? 0) + 'px', display: open ? undefined : 'none' },
    }, open ? filtered.map((opt, i) =>
      h('div', {
        class: `wf-autocomplete-option${i === activeIndex ? ' wf-autocomplete-option--active' : ''}`,
        key: opt.value,
        onMouseDown: (e: any) => {
          e.stopPropagation()
          if (!opt.disabled) pick(opt)
        },
      }, renderOption ? renderOption(opt) : (opt.label ?? opt.value)),
    ) : [])

    return h('div', { class: 'wf-autocomplete-wrap', ref: wrapRef }, [
      h('input', {
        class: 'wf-autocomplete-input wf-input',
        value: query,
        placeholder,
        disabled,
        onInput,
        onKeyDown,
        onFocus: () => { if (!open) setOpen(true) },
      }),
      dropdown,
    ])
  }
}
