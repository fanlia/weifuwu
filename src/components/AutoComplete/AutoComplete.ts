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
  // open/keyword 状态经 $（Proxy 自动 dirty → 重渲染）；受控桥 props.open 覆盖读
  const $ = ctx.ui.$()
  $.open = _init?.open ?? false
  // 内部输入态（Select searchable 同款纪律）：输入期间 value 由 $ 管理——
  // 不依赖受控 value 回流（父 render 会重挂 input → 焦点丢失——AutoComplete 教训）
  $.keyword = ''
  // 选中态：关闭时 input 回填选中 label（Select 单选同款——
  // demo 受控 onChange 不渲染则 props.value 不回流 → input 空）
  $.selected = ''
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

  const pick = (option: AutoCompleteOption) => {
    latestOnChange?.(option.value)
    latestOnSelect?.(option.value, option)
    $.keyword = ''
    $.selected = option.label ?? option.value // 关闭后回填
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
    if (props.open !== undefined) $.open = !!props.open

    // 打开时输入态优先（$.keyword——用户正在输入）；无输入回退受控值
    const query = $.open ? ($.keyword || latestValue) : latestValue
    const filtered = (props.filter ?? filterOptions)(options, query)
    if (activeIndex >= filtered.length) activeIndex = -1

    // IME 组合（中文拼音）：组合期间不处理 onChange/不重渲染——
    // 否则受控 value 重置打断输入法（Mentions/TagsInput 同款纪律）
    let composing = false
    const onInput = (e: any) => {
      if (composing || e.isComposing) return
      const v = e.target.value
      $.keyword = v // 内部输入态（$ 自动 dirty → 自身重渲染，不依赖父回流）
      latestOnChange?.(v)
      if (!$.open) setOpen(true)
      activeIndex = -1
    }
    const onCompositionStart = () => { composing = true }
    const onCompositionEnd = (e: any) => {
      composing = false
      // 组合完成：处理最终中文值（过滤/回填）
      const v = (e.target as HTMLInputElement)?.value ?? ''
      $.keyword = v
      latestOnChange?.(v)
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
        // key 稳定：数组 children 无 key 子节点每次渲染重建（框架 diff 行为）——
        // input 重建 → 焦点丢失（Select searchable 同款——受控输入通用纪律）
        key: 'ac-input',
        class: 'wf-autocomplete-input wf-input',
        // 打开/输入时显示内部 keyword；关闭时选中 label（无选中回退受控值）
        value: $.open ? $.keyword : ($.selected || query),
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
