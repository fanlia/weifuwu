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

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

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
  // open 状态经 $（Proxy 自动 dirty → 重渲染，与 usePopup 集成）；
  // keyword/selected 由 useControlledInput 管理（render 层调用——C3 原语）
  const $ = ctx.ui.$()
  $.open = _init?.open ?? false
  let activeIndex = -1
  let latestValue = _init?.value ?? ''
  let latestOnChange: ((v: string) => void) | undefined
  let latestOpen: boolean | undefined = _init?.open
  let latestOnOpenChange: ((v: boolean) => void) | undefined
  let latestOnSelect: ((v: string, o: AutoCompleteOption) => void) | undefined
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { if (el) wrapEl = el }

  // usePopup 组合器：portal + 定位 + 打开自动 refresh + 锚点感知 +
  // Escape + 外部点击（AGENTS.md 弹窗纪律——此前普通 fixed div + 手动
  // usePopupPosition：pos 初始 0 且打开不 refresh → 下拉 0,0 宽 0 不可见）
  const popup = ctx.ui.usePopup({
    trigger: () => 'click',
    placement: () => 'bottom',
    center: false, // 左对齐输入框
    gap: 4,
    el: () => wrapEl,
    isOpen: () => $.open,
    setOpen: (v) => {
      $.open = v // Proxy 赋值 → 自动 dirty → 重渲染
      latestOnOpenChange?.(v)
    },
  })

  const setOpen = (v: boolean) => {
    popup.setOpen(v)
  }

  // useControlledInput 原语句柄（render 层调用——闭包变量供 pick 用）
  let inputCtrl: ReturnType<WfuiContext['ui']['useControlledInput']> | null = null

  const pick = (option: AutoCompleteOption) => {
    inputCtrl?.setValue(option.value)
    latestOnSelect?.(option.value, option)
    inputCtrl?.setKeyword('')
    inputCtrl?.setSelectedLabel(option.label ?? option.value) // 关闭后回填
    activeIndex = -1
    setOpen(false)
  }

  // ── render（每次 dirty/props 变化）──
  return (props: AutoCompleteProps) => {
    const { options, value, placeholder = '输入搜索…', disabled, renderOption, onSelect } = props
    // C3 原语：受控 value + 内部输入态/选中态（render 阶段调用——读最新 props）
    inputCtrl = ctx.ui.useControlledInput({ value, onChange: props.onChange, name: 'AutoComplete' })
    const keyword = inputCtrl.keyword
    const selectedLabel = inputCtrl.selectedLabel
    latestValue = value ?? ''
    latestOnChange = props.onChange
    latestOpen = props.open
    latestOnOpenChange = props.onOpenChange
    latestOnSelect = onSelect
    if (props.open !== undefined) $.open = !!props.open

    // 打开时输入态优先（keyword——用户正在输入）；无输入回退受控值
    const query = $.open ? (keyword || latestValue) : latestValue
    const filtered = (props.filter ?? filterOptions)(options, query)
    if (activeIndex >= filtered.length) activeIndex = -1

    // IME 组合（中文拼音）：组合期间不处理 onChange/不重渲染——
    // 否则受控 value 重置打断输入法（Mentions/TagsInput 同款纪律）
    let composing = false
    const onInput = (e: any) => {
      if (composing || e.isComposing) return
      const v = e.target.value
      inputCtrl?.setKeyword(v) // C3 内部输入态（不依赖受控 value 回流）
      inputCtrl?.setValue(v)
      if (!$.open) setOpen(true)
      activeIndex = -1
    }
    const onCompositionStart = () => { composing = true }
    const onCompositionEnd = (e: any) => {
      composing = false
      // 组合完成：处理最终中文值（过滤/回填）
      const v = (e.target as HTMLInputElement)?.value ?? ''
      inputCtrl?.setKeyword(v)
      inputCtrl?.setValue(v)
      if (!$.open) setOpen(true)
    }

    const onKeyDown = (e: any) => {
      if (!$.open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
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
        if ($.open && activeIndex >= 0 && filtered[activeIndex]) {
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
    }, filtered.map((opt, i) =>
      h('div', {
        class: `wf-autocomplete-option${i === activeIndex ? ' wf-autocomplete-option--active' : ''}`,
        key: opt.value,
        onMouseDown: (e: any) => {
          e.stopPropagation()
          if (!opt.disabled) pick(opt)
        },
      }, renderOption ? renderOption(opt) : (opt.label ?? opt.value)),
    ))

    return h('div', { class: 'wf-autocomplete-wrap', ref: wrapRef }, [
      h('input', {
        // C1 修复后：portal 内部 key 不算用户 keyed → allUnkeyed 按位置复用
        // input 不重建（此前需手动 key 防焦点丢失——现已治本）
        class: 'wf-autocomplete-input wf-input',
        role: 'combobox',
        'aria-haspopup': 'listbox',
        'aria-expanded': String($.open),
        // 打开/输入时显示内部 keyword；关闭时选中 label（无选中回退受控值）
        value: $.open ? keyword : (selectedLabel || query),
        placeholder,
        disabled,
        onInput,
        onKeyDown,
        onCompositionStart,
        onCompositionEnd,
        onFocus: () => { if (!$.open) setOpen(true) },
      }),
      popup.portal(dropdown, 'wf-autocomplete'),
    ])
  }
}
