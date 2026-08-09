import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface CopyButtonProps {
  /** 要复制的文本 */
  value: string
  /** 按钮文字（默认仅图标） */
  label?: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'secondary' | 'default'
  /** 仅图标（无文字） */
  iconOnly?: boolean
  /** 成功提示文字（默认「已复制」） */
  successText?: string
  onCopied?: () => void
  className?: string
  [key: string]: any
}

function fallbackCopy(text: string) {
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

/** 复制按钮（weifuwu 独有，Chat 消息复制/CodeBlock 抽取统一） */
export const CopyButton: Component<CopyButtonProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let copied = false
  let timer: ReturnType<typeof setTimeout> | undefined

  return (props) => {
    const {
      value, label, size = 'md', variant = 'secondary',
      iconOnly, successText = '已复制', onCopied, className, ...rest
    } = props

    const doCopy = async () => {
      // 经 ctx.browser 统一复制（clipboard + execCommand 降级）——组件不直接碰 window/document
      await ctx.browser?.copyText(value)
      copied = true
      onCopied?.()
      ctx.ui.render()
      clearTimeout(timer)
      timer = setTimeout(() => {
        copied = false
        ctx.ui.render()
      }, 2000)
    }

    const children: any[] = []
    if (copied) {
      children.push(h(Icon, { name: 'check', size: 14 }))
      if (!iconOnly) children.push(h('span', { class: 'wf-copy-btn-text' }, successText))
    } else {
      children.push(h(Icon, { name: 'copy', size: 14 }))
      if (!iconOnly && label) children.push(h('span', { class: 'wf-copy-btn-text' }, label))
    }

    return h('button', {
      type: 'button',
      class: [
        'wf-copy-btn',
        `wf-copy-btn--${size}`,
        `wf-copy-btn--${variant}`,
        copied ? 'wf-copy-btn--copied' : '',
        className,
      ].filter(Boolean).join(' '),
      'aria-label': label || '复制',
      onClick: doCopy,
      ...rest,
    }, children)
  }
}
