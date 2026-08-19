/**
 * weifuwu/components — Markdown
 *
 * AI 回复/富文本渲染。安全子集解析 → VNode 渲染（天然转义，无 innerHTML 注入面）。
 * 与 CodeBlock 组合渲染代码围栏。
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h, Fragment } from '../../vdom/index.ts'
import { parseMarkdown, parseInline, type MdBlock, type MdInline } from './parser.ts'
import { CodeBlock } from '../CodeBlock/CodeBlock.ts'

export interface MarkdownProps {
  content: string
  className?: string
}

export const Markdown: Component<MarkdownProps> = async (_init, _ctx) =>
  async (props) => {
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
    case 'list': {
      const hasTask = b.checks?.some(c => c !== null)
      const Tag = b.ordered ? 'ol' : 'ul'
      return h(Tag, { class: `wf-md-${b.ordered ? 'ol' : 'ul'}${hasTask ? ' wf-md-task-list' : ''}`, key }, b.items!.map((it, i) => {
        const checked = b.checks?.[i]
        return h('li', { class: `wf-md-li${checked !== null && checked !== undefined ? ' wf-md-task' : ''}`, key: i },
          checked !== null && checked !== undefined
            ? [h('input', { type: 'checkbox', class: 'wf-md-task-check', checked: !!checked, disabled: true, key: 'c' }), ...renderInline(it)]
            : renderInline(it))
      }))
    }
    case 'code':
      return h(CodeBlock, { key, code: b.code ?? '', lang: b.lang })
    case 'quote':
      return h('blockquote', { class: 'wf-md-quote', key }, renderInline(b.inline!))
    case 'hr':
      return h('hr', { class: 'wf-md-hr', key })
    case 'table': {
      const alignStyle = (i: number) => b.aligns?.[i] ? { textAlign: b.aligns[i] } : undefined
      return h('div', { class: 'wf-md-table-wrap', key }, h('table', { class: 'wf-md-table' }, [
        h('thead', { key: 'h' }, h('tr', { key: 'r' }, b.headers!.map((hd, i) =>
          h('th', { class: 'wf-md-th', style: alignStyle(i), key: i }, renderInline(parseInline(hd)))))),
        h('tbody', { key: 'b' }, b.rows!.map((row, ri) =>
          h('tr', { class: 'wf-md-tr', key: ri }, row.map((cell, ci) =>
            h('td', { class: 'wf-md-td', style: alignStyle(ci), key: ci }, renderInline(parseInline(cell))))))),
      ]))
    }
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
      case 'del':
        return h('del', { class: 'wf-md-del', key: i }, renderInline(n.children ?? []))
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
