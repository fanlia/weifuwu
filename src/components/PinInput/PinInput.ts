import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface PinInputProps {
  /** 位数，默认 6 */
  length?: number
  /** 受控完整值（如 '483920'） */
  value?: string
  onChange?: (value: string) => void
  /** number = 纯数字（默认）；text = 任意字符 */
  type?: 'number' | 'text'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  'aria-label'?: string
}

/**
 * 验证码输入（对应 shadcn InputOTP / antd 无）：自动聚焦下一格、粘贴分派、
 * Backspace 回退、方向键移动。受控 value 为完整字符串。
 */
export const PinInput: Component<PinInputProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let refs: (HTMLInputElement | null)[] = []

  const focusCell = (i: number) => {
    const el = refs[i]
    if (el) {
      el.focus()
      el.select()
    }
  }

  // 闭包捕获索引 + Map 缓存稳定（React useCallback 等价物）：
  // ref 直接闭包捕获 i（不读 dataset——根治 data-idx 依赖 setProp 顺序的隐式契约）；
  // 函数引用跨渲染缓存复用（不触发 ref-diff 误清理——§5.1 纪律）
  const cellRefs = new Map<number, (el: HTMLInputElement | null) => void>()
  const inputRefFor = (i: number) => {
    let fn = cellRefs.get(i)
    if (!fn) {
      fn = (el) => { if (el) refs[i] = el }
      cellRefs.set(i, fn)
    }
    return fn
  }

  return async (props) => {
    const {
      length = 6, value = '', onChange, type = 'number',
      size = 'md', disabled, 'aria-label': ariaLabel,
    } = props

    const isNumber = type === 'number'

    const handleInput = (i: number, raw: string) => {
      if (disabled || !onChange) return
      let ch = raw.slice(-1)
      if (isNumber && !/^\d$/.test(ch)) return // 数字模式拒绝非数字
      // 构造新完整串：替换第 i 位
      const chars = value.split('')
      while (chars.length < length) chars.push('')
      chars[i] = ch
      onChange(chars.join('').slice(0, length))
      if (i + 1 < length) focusCell(i + 1)
    }

    const handleKeyDown = (i: number, e: any) => {
      if (disabled) return
      const key = e.key
      if (key === 'Backspace') {
        e.preventDefault()
        if (value[i]) {
          // 当前格有值 → 清除
          const chars = value.split('')
          chars[i] = ''
          onChange?.(chars.join(''))
        } else if (i > 0) {
          focusCell(i - 1)
        }
      } else if (key === 'ArrowLeft') {
        e.preventDefault()
        if (i > 0) focusCell(i - 1)
      } else if (key === 'ArrowRight') {
        e.preventDefault()
        if (i + 1 < length) focusCell(i + 1)
      } else if (key === 'Home') {
        e.preventDefault()
        focusCell(0)
      } else if (key === 'End') {
        e.preventDefault()
        focusCell(length - 1)
      }
    }

    const handlePaste = (e: any) => {
      if (disabled || !onChange) return
      const text = e.clipboardData?.getData('text') ?? ''
      e.preventDefault()
      if (!text) return
      let cleaned = text.slice(0, length)
      if (isNumber) cleaned = cleaned.replace(/\D/g, '').slice(0, length)
      if (!cleaned) return
      onChange(cleaned)
      focusCell(Math.min(cleaned.length, length - 1))
    }

    const cells: any[] = []
    for (let i = 0; i < length; i++) {
      cells.push(h('input', {
        key: i,
        type: 'text',
        class: 'wf-pin-input-cell',
        value: value[i] ?? '',
        maxLength: 1,
        inputMode: isNumber ? 'numeric' : undefined,
        pattern: isNumber ? '[0-9]' : undefined,
        'aria-label': `${ariaLabel ?? '验证码'}第 ${i + 1} 位`,
        disabled: disabled || undefined,
        ref: inputRefFor(i),
        onInput: (e: any) => handleInput(i, e.target.value),
        onKeyDown: (e: any) => handleKeyDown(i, e),
        onPaste: handlePaste,
      }))
    }

    return h('div', {
      class: ['wf-pin-input', `wf-pin-input--${size}`].join(' '),
      role: 'group',
      'aria-label': ariaLabel,
    }, cells)
  }
}
