/**
 * weifuwu/components — CodeBlock
 *
 * 代码展示块：语言标签 + 复制按钮 + 横向滚动 + 自研轻量语法高亮
 * （highlight.ts tokenizer——零依赖 FS-05）。
 * 由 Markdown 代码围栏复用；也可独立使用。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'
import { tokenize } from './highlight.ts'

export interface CodeBlockProps {
  code: string
  lang?: string
  title?: string
}

export const CodeBlock: Component<CodeBlockProps> = (_init, ctx) => {
  let copied = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let latestCode = ''

  const copy = async () => {
    await ctx.browser?.copyText(latestCode)
    copied = true
    ctx.ui.render()
    clearTimeout(timer)
    timer = setTimeout(() => { copied = false; ctx.ui.render() }, 1600)
  }

  return (props: CodeBlockProps) => {
    const { code, lang, title } = props
    latestCode = code

    const langEl = lang
      ? h('span', { class: 'wf-codeblock-lang' }, [h('span', { class: 'wf-codeblock-dot' }), lang])
      : null

    const copyBtn = h('button', {
      class: 'wf-codeblock-copy',
      type: 'button',
      'aria-label': '复制',
      title: '复制代码',
      onClick: copy,
    }, copied ? h(Icon, { name: 'check', size: 14 }) : h(Icon, { name: 'copy', size: 14 }))

    const header = h('div', { class: 'wf-codeblock-header' }, [
      h('span', { class: 'wf-codeblock-title' }, title ?? langEl ?? '代码'),
      copyBtn,
    ].filter(Boolean))

    // 语法高亮：tokenize → span（text 类型不包 span——保持 DOM 轻量）
    const highlighted = code
      ? tokenize(code, lang).map((t, i) =>
          t.type === 'text'
            ? t.text
            : h('span', { class: `wf-hl-${t.type}` }, t.text))
      : code

    const pre = h('pre', { class: 'wf-codeblock-pre' },
      h('code', { class: 'wf-codeblock-code' }, highlighted))

    return h('div', { class: 'wf-codeblock' }, [header, pre])
  }
}
