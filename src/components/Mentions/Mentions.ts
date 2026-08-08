import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { computeFixedPosRect } from '../../client/popup.ts'

export interface MentionsOption {
  value: string
  label?: string
}

export interface MentionsProps {
  value?: string
  onChange?: (value: string) => void
  options?: MentionsOption[]
  /** 触发字符，默认 '@' */
  prefix?: string
  placeholder?: string
  rows?: number
  disabled?: boolean
  size?: 'sm' | 'md' | 'lg'
}

/** @提及输入（对应 antd Mentions）：输入 prefix + 关键词弹出候选，点击/Enter 插入。
 * 裁剪：不做多 prefix/自定义高亮渲染/远程搜索（options 静态传入）。 */
export const Mentions: Component<MentionsProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let open = false
  let keyword = ''
  let keywordStart = -1 // prefix 在文本中的位置
  let highlight = 0
  let composing = false

  let taEl: HTMLElement | null = null
  let prevOpen = false
  const taRef = (el: HTMLElement | null) => { taEl = el }

  // 弹层跟随输入框（参考 Popover 定位模式）
  const pos = ctx.ui.usePopupPosition({
    el: () => taEl,
    isOpen: () => open,
    compute: (r) => computeFixedPosRect(r, 'bottom', 4, false),
  })

  const close = () => {
    if (open) {
      open = false
      ctx.ui.render()
    }
  }

  return (props) => {
    const {
      value = '', onChange, options = [], prefix = '@',
      placeholder, rows = 3, disabled, size = 'md',
    } = props

    const detect = (text: string, pos: number) => {
      if (composing) { close(); return }
      // 光标前最后一个 prefix
      const before = text.slice(0, pos)
      const idx = before.lastIndexOf(prefix)
      if (idx === -1) { close(); return }
      const tail = before.slice(idx + 1)
      if (tail.includes(' ')) { close(); return } // prefix 前有空格后的词内有空格？tail 不应含空格
      if (tail.length > 0 && tail.includes('\n')) { close(); return }
      keyword = tail
      keywordStart = idx
      highlight = 0
      open = true
      ctx.ui.render()
    }

    const filtered = keyword
      ? options.filter(o => o.value.toLowerCase().includes(keyword.toLowerCase()))
      : options

    const insert = (opt: MentionsOption) => {
      if (!onChange) return
      const before = value.slice(0, keywordStart)
      const after = value.slice(keywordStart + 1 + keyword.length) // prefix + keyword 之后
      const next = `${before}${prefix}${opt.value} ${after}`
      open = false
      onChange(next)
    }

    const handleInput = (e: any) => {
      const text = e.target.value
      onChange?.(text)
      detect(text, e.target.selectionStart ?? text.length)
    }

    const handleKeyDown = (e: any) => {
      if (!open) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        highlight = Math.min(highlight + 1, Math.max(filtered.length - 1, 0))
        ctx.ui.render()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        highlight = Math.max(highlight - 1, 0)
        ctx.ui.render()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const opt = filtered[highlight]
        if (opt) insert(opt)
      } else if (e.key === 'Escape') {
        close()
      }
    }

    // 打开瞬间先算坐标（Popover 同款时序：refresh 必须在 panel VNode 创建前——
    // 否则 VNode 用旧 pos(0,0) 渲染 → 首次打开左上角）
    if (open && !prevOpen) pos.refresh()
    prevOpen = open

    const panel = open && filtered.length > 0 ? createPortal(
      h('div', {
        class: 'wf-mentions-panel',
        role: 'listbox',
        style: { position: 'fixed', top: pos.top, left: pos.left },
      }, filtered.map((opt, i) =>
        h('button', {
          type: 'button',
          class: `wf-mentions-option${highlight === i ? ' wf-mentions-option--hl' : ''}`,
          key: opt.value,
          role: 'option',
          onClick: () => insert(opt),
          onMouseEnter: () => { highlight = i },
        }, opt.label ?? opt.value)
      )),
      'popover',
    ) : null

    const ta = h('textarea', {
      class: `wf-mentions-input wf-mentions-input--${size}`,
      rows,
      placeholder,
      value,
      disabled: disabled || undefined,
      ref: taRef,
      onInput: handleInput,
      onKeyDown: handleKeyDown,
      onCompositionStart: () => { composing = true; close() },
      onCompositionEnd: () => { composing = false },
    })

    return h('div', { class: 'wf-mentions' }, [ta, panel].filter(Boolean))
  }
}
