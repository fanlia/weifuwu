import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

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
 * 裁剪（CS-05，见 design/components-cuts.md）：不做多 prefix/自定义高亮渲染/远程搜索（options 静态传入）。 */
export const Mentions: Component<MentionsProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let open = false
  let keyword = ''
  let keywordStart = -1 // prefix 在文本中的位置
  let highlight = 0
  let composing = false

  let taEl: HTMLElement | null = null
  const taRef = (el: HTMLElement | null) => { taEl = el }

  // useControlledInput：受控/非受控统一（原非受控 textarea value='' 固定——
  // 每次 render 清空用户输入——严重违规）
  let inputCtrl: ReturnType<UIContext['ui']['useControlledInput']> | null = null

  // usePopup：借用面板定位/视口 clamp + 外部点击关闭（不 spread wrapProps——
  // 打开由输入 '@' 驱动，非 wrap 触发）；Escape 由 textarea 自己的 onKeyDown 处理
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncPanel = (panel: import('../../vdom/index.ts').VNode | null): void => {
    if (open && panel && !handle)
      handle = ctx.ui.openPopup({
        anchor: () => taEl,
        placement: 'bottom',
        center: false,
        gap: 4,
        content: () => panel,
        onClose: () => { handle = null; if (open) { open = false; ctx.render() } },
      })
    else if (!open && handle) { handle.close(); handle = null }
    else if (handle) handle.update(panel)
  }

  const close = () => {
    if (open) {
      open = false
      ctx.render()
    }
  }

  return (props) => {
    const {
      options = [], prefix = '@',
      placeholder, rows = 3, disabled, size = 'md',
    } = props

    // render 阶段调用（读最新 props + Map 缓存跨渲染）
    inputCtrl = ctx.ui.useControlledInput({ value: props.value, onChange: props.onChange, name: 'Mentions' })
    const value = inputCtrl.value ?? ''

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
      ctx.render()
    }

    const filtered = keyword
      ? options.filter(o => o.value.toLowerCase().includes(keyword.toLowerCase()))
      : options

    const insert = (opt: MentionsOption) => {
      const before = value.slice(0, keywordStart)
      const after = value.slice(keywordStart + 1 + keyword.length) // prefix + keyword 之后
      const next = `${before}${prefix}${opt.value} ${after}`
      open = false
      const wasControlled = inputCtrl?.controlled?.value !== undefined
      inputCtrl?.setValue(next)
      // onChange 通知语义（非受控也调）；受控时 setValue 已调
      if (!wasControlled) props.onChange?.(next)
    }

    const handleInput = (e: any) => {
      const text = e.target.value
      inputCtrl?.setValue(text)
      detect(text, e.target.selectionStart ?? text.length)
    }

    const handleKeyDown = (e: any) => {
      if (!open) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        highlight = Math.min(highlight + 1, Math.max(filtered.length - 1, 0))
        ctx.render()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        highlight = Math.max(highlight - 1, 0)
        ctx.render()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const opt = filtered[highlight]
        if (opt) insert(opt)
      } else if (e.key === 'Escape') {
        close()
      }
    }

    // 打开瞬间坐标由 openPopup 内部处理（anchor + refresh）
    const panel = open && filtered.length > 0 ? h('div', {
      class: 'wf-mentions-panel',
      role: 'listbox',
    }, filtered.map((opt, i) =>
      h('button', {
        type: 'button',
        class: `wf-mentions-option${highlight === i ? ' wf-mentions-option--hl' : ''}`,
        key: opt.value,
        role: 'option',
        onClick: () => insert(opt),
        onMouseEnter: () => { highlight = i },
      }, opt.label ?? opt.value)
    )) : null

    const ta = h('textarea', {
      class: `wf-mentions-input wf-mentions-input--${size}`,
      rows,
      placeholder,
      value,
      disabled: disabled || undefined,
      ref: taRef,
      // R42：@提及建议面板语义（textarea 是 trigger——展开状态随面板）
      'aria-haspopup': 'listbox',
      'aria-expanded': String(open),
      onInput: handleInput,
      onKeyDown: handleKeyDown,
      onCompositionStart: () => { composing = true; close() },
      onCompositionEnd: () => { composing = false },
    })

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    syncPanel(panel)
    return h('div', { class: 'wf-mentions' }, [ta])
  }
}
