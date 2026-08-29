import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export interface SearchInputProps {
  value?: string
  placeholder?: string
  disabled?: boolean
  onInput?: (e: Event) => void
  onClear?: () => void
}

/**
 * SearchInput —— 搜索输入框（受控/非受控统一 + IME 门控）
 *
 * - 受控（value 显式传入）：input.value 由 value 回写，清除按钮随 value 显隐；
 *   非受控（不传 value）：DOM 值透传 onInput，组件不回写（§5.3 输入态不依赖受控回流）
 * - IME 组合（中文拼音）：组合期间跳过 onInput（composing + e.isComposing 门控）——
 *   避免受控 value 重置打断输入法（AutoComplete/Mentions/TagsInput 同款纪律）；
 *   组合结束 onCompositionEnd 处理最终中文值
 */
export const SearchInput: Component<SearchInputProps> = (_init, _ctx) => {
  // IME 组合门控（mount 作用域 let——跨渲染保持）
  let composing = false
  return (props) => {
    const { value, placeholder = '搜索...', onInput, onClear, disabled } = props
    // 受控判定：value !== undefined → 受控（回写 input.value + 清除按钮随 value）
    const controlled = value !== undefined
    const inputValue = value ?? ''

    const clearBtn = controlled && inputValue && onClear
      ? h('button', {
          class: 'wf-search-clear',
          type: 'button',
          'aria-label': '清除',
          onClick: onClear,
        }, h(Icon, { name: 'close' }))
      : null

    const icon = h('span', { class: 'wf-search-icon' }, h(Icon, { name: 'search' }))

    return h('div', { class: clearBtn ? 'wf-search wf-search--has-clear' : 'wf-search' }, [
      icon,
      h('input', {
        class: ['wf-search-input', disabled ? 'wf-search-input--dis' : ''].filter(Boolean).join(' '),
        type: 'search',
        // 受控才回写 value；非受控不写（undefined → setProp 跳过——DOM 值为唯一来源）
        value: controlled ? inputValue : undefined,
        placeholder,
        disabled: disabled || undefined,
        'aria-disabled': disabled ? 'true' : undefined,
        onInput: (e: any) => {
          // IME 组合期间跳过（e.isComposing 兜底——真实事件带标志）
          if (composing || e.isComposing) return
          onInput?.(e)
        },
        onCompositionStart: () => { composing = true },
        onCompositionEnd: (e: any) => {
          composing = false
          // 组合完成：处理最终中文值（过滤/回填）
          onInput?.(e)
        },
      }),
      clearBtn,
    ].filter(Boolean))
  }
}
