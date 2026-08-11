import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

/**
 * CitationCard — RAG 检索引用展示（AI 差异化）
 *
 * AI 回复的引用来源列表：折叠「引用 N 条」头部 + 展开条目列表
 * （序号 + 标题 + 来源 + 片段 + 可选链接）。手动优先（let + render()）。
 *
 * ```tsx
 * <CitationCard
 *   items={[{ id, title, source, snippet, url? }]}
 *   maxVisible={3}
 *   onOpen={(c) => openDoc(c.id)}
 * />
 * ```
 */
export interface Citation {
  id: string
  title: string
  /** 来源元信息（文档路径/域名等） */
  source?: string
  /** 原文片段（裁剪：不做全文展开——片段即展示） */
  snippet: string
  /** 可点击链接（无 onOpen 时新窗口打开） */
  url?: string
}

export interface CitationCardProps {
  items: Citation[]
  /** 折叠头文案（默认「引用来源」） */
  label?: string
  /** 折叠时最多显示条数（默认 3；溢出显示 +N 汇总条目） */
  maxVisible?: number
  /** 初始展开（默认折叠） */
  defaultExpanded?: boolean
  /** 点击条目回调（提供时不渲染链接，由调用方处理跳转/打开） */
  onOpen?: (citation: Citation) => void
}

export const CitationCard: Component<CitationCardProps, WfuiContext> = async (initProps, ctx) => {
  let expanded = !!initProps.defaultExpanded

  return (props) => {
    const { items, label = '引用来源', maxVisible = 3, onOpen } = props
    if (!items?.length) return null

    const toggle = () => { expanded = !expanded; ctx.ui.render() }

    // 折叠时最多 maxVisible 条；溢出追加 +N 汇总条目（点击整条展开）
    const shown = items.slice(0, maxVisible)
    const overflow = items.length - shown.length

    const rows: any[] = shown.map((c, i) => {
      const linkProps = onOpen
        ? { role: 'button', tabindex: 0, onClick: () => onOpen(c), onKeyDown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c) } } }
        : c.url
          ? { href: c.url, target: '_blank', rel: 'noopener' }
          : {}
      return h('div', { key: c.id, class: 'wf-citation-item' }, [
        h('span', { class: 'wf-citation-idx' }, String(i + 1)),
        h('div', { class: 'wf-citation-content' }, [
          h('div', { class: 'wf-citation-title' }, [
            c.title,
            c.source ? h('span', { class: 'wf-citation-source' }, c.source) : null,
          ]),
          h('div', { class: 'wf-citation-snippet' }, c.snippet),
        ]),
        (onOpen || c.url)
          ? h('a', { class: 'wf-citation-link', ...linkProps }, h(Icon, { name: 'external-link' }))
          : null,
      ])
    })

    if (overflow > 0) {
      rows.push(h('div', {
        key: 'overflow',
        class: 'wf-citation-item wf-citation-more',
        role: 'button',
        tabindex: 0,
        'aria-label': `展开全部 ${items.length} 条引用`,
        onClick: toggle,
        onKeyDown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } },
      }, `+${overflow} 条更多`))
    }

    return h('div', { class: 'wf-citation' }, [
      h('button', {
        type: 'button',
        class: 'wf-citation-toggle',
        'aria-expanded': expanded,
        onClick: toggle,
        onKeyDown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle() } },
      }, [
        h('span', { class: `wf-citation-chevron${expanded ? ' wf-citation-chevron--open' : ''}` }, h(Icon, { name: 'chevron-down' })),
        h('span', { class: 'wf-citation-count' }, `${label} · ${items.length} 条`),
      ]),
      h('div', {
        class: `wf-citation-body${expanded ? ' wf-citation-body--open' : ''}`,
        hidden: !expanded,
      }, rows),
    ])
  }
}
