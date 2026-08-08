/**
 * weifuwu/components — Markdown
 *
 * AI 回复/富文本渲染。安全子集解析 → VNode 渲染（天然转义，无 innerHTML 注入面）。
 * 与 CodeBlock 组合渲染代码围栏。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, Fragment } from '../../client/vnode.ts'
import { parseMarkdown, type MdBlock, type MdInline } from './parser.ts'
import { CodeBlock } from '../CodeBlock/CodeBlock.ts'

export interface MarkdownProps {
  content: string
  className?: string
}

export const Markdown: Component<MarkdownProps> = (_init, _ctx) =>
  (props) => {
    const { content = '', className } = props
    const blocks = parseMarkdown(content)
    if (blocks.length === 0) return null

    return h('div', { class: `wf-md${className ? ` ${className}` : ''}` }, blocks.map((b, i) => renderBlock(b, i)))
  }

function renderBlock(b: MdBlock, key: number): any {
  switch (b.type) {
    case 'heading':
      return h(`h${b.level!}` as any, { class: `wf-md-h wf-md-h${b.level}`, key }, renderInline(b.inline!))
    case 'paragraph':
      return h('p', { class: 'wf-md-p', key }, renderInline(b.inline!))
    case 'list':
      return b.ordered
        ? h('ol', { class: 'wf-md-ol', key }, b.items!.map((it, i) => h('li', { class: 'wf-md-li', key: i }, renderInline(it))))
        : h('ul', { class: 'wf-md-ul', key }, b.items!.map((it, i) => h('li', { class: 'wf-md-li', key: i }, renderInline(it))))
    case 'code':
      return h(CodeBlock, { key, code: b.code ?? '', lang: b.lang })
    case 'quote':
      return h('blockquote', { class: 'wf-md-quote', key }, renderInline(b.inline!))
    case 'hr':
      return h('hr', { class: 'wf-md-hr', key })
    default:
      return null
  }
}

export function renderInline(nodes: MdInline[]): any[] {
  return nodes.map((n, i) => {
    switch (n.type) {
      case 'code':
        return h('code', { class: 'wf-md-code', key: i }, n.text ?? '')
      case 'bold':
        return h('strong', { class: 'wf-md-strong', key: i }, renderInline(n.children ?? []))
      case 'italic':
        return h('em', { class: 'wf-md-em', key: i }, renderInline(n.children ?? []))
      case 'link':
        // 安全：parseInline 已做 URL 白名单；再强制 noopener/nofollow
        return h('a', {
          class: 'wf-md-link', key: i,
          href: n.href,
          target: '_blank', rel: 'noopener noreferrer',
        }, renderInline(n.children ?? []))
      default:
        return h(Fragment, { key: i }, n.text ?? '')
    }
  })
}
