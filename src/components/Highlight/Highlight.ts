/**
 * weifuwu/components — Highlight
 *
 * 搜索词高亮：给定文本 + 高亮词数组 → 分词渲染 <mark>（零依赖，VNode 拼接）。
 * 配合 SearchInput/Table 搜索结果命中展示。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface HighlightProps {
  text: string
  query?: string | string[]
  className?: string
}

export const Highlight: Component<HighlightProps> = (_init, _ctx) =>
  (props) => {
    const { text, query, className } = props
    const queries = (Array.isArray(query) ? query : query ? [query] : [])
      .filter(Boolean)
      .map((q) => q.toLowerCase())

    if (queries.length === 0) return h('span', { class: `wf-highlight${className ? ` ${className}` : ''}` }, text)

    const nodes: any[] = []
    let i = 0
    const lower = text.toLowerCase()
    while (i < text.length) {
      let best: { start: number; end: number } | null = null
      for (const q of queries) {
        const idx = lower.indexOf(q, i)
        if (idx >= 0 && (!best || idx < best.start)) best = { start: idx, end: idx + q.length }
      }
      if (!best) {
        nodes.push(text.slice(i))
        break
      }
      if (best.start > i) nodes.push(text.slice(i, best.start))
      nodes.push(h('mark', { class: 'wf-highlight-mark' }, text.slice(best.start, best.end)))
      i = best.end
    }

    return h('span', { class: `wf-highlight${className ? ` ${className}` : ''}` }, nodes)
  }
