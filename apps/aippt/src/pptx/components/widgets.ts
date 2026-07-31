/**
 * pptx-vdom components/widgets.ts — 业务组件（跨 deck 可复用的表达单元）
 *
 * 每个 widget 接收自身定位（x/y/w）并返回多个顶层元素（数组）。
 * 组件签名：(props, theme) => VNode | VNode[]
 * 文本内容通过 props.children 传入。
 */

import { h } from '../vnode.ts'
import type { Theme } from '../theme.ts'
import { Text, HLine, Rect } from './primitives.ts'

export type Widget = (props: any, theme: Theme) => any

/** 数据卡片：大数字 + 标签 + 可选环比 */
export const StatCard: Widget = (p, theme) => {
  const x = p.x, y = p.y, w = p.w, h = p.h ?? 1.7
  const pad = 0.25
  return [
    Rect({ x, y, w, h, fill: p.fill ?? theme.colors.surface, lineColor: p.lineColor ?? theme.colors.line, lineWidth: 1 }, theme),
    Text({ x: x + pad, y: y + 0.3, w: w - pad * 2, fontSize: p.valueSize ?? 26, bold: true, color: p.valueColor ?? theme.colors.primary, children: p.value }, theme),
    Text({ x: x + pad, y: y + h - 0.55, w: w - pad * 2, fontSize: 12, color: theme.colors.textSecondary, children: p.label }, theme),
    p.delta
      ? Text({ x: x + pad, y: y + 0.85, w: w - pad * 2, fontSize: 10, bold: true, color: p.deltaColor ?? theme.colors.success, children: p.delta }, theme)
      : null,
  ]
}

/** 引用块：左侧主色竖条 + 引言 + 出处 */
export const QuoteCard: Widget = (p, theme) => {
  const x = p.x, y = p.y, w = p.w
  return [
    Rect({ x, y, w: 0.08, h: 0.9, fill: theme.colors.primary }, theme),
    Text({ x: x + 0.35, y, w: w - 0.35, fontSize: p.size ?? 18, bold: true, color: theme.colors.text, children: p.quote }, theme),
    Text({ x: x + 0.35, y: y + 0.55, w: w - 0.35, fontSize: 11, color: theme.colors.muted, children: p.author ?? '' }, theme),
  ]
}

/** 时间线：横排节点（圆点 + 日期 + 文本） */
export const Timeline: Widget = (p, theme) => {
  const items: { date: string; text: string }[] = p.items ?? []
  const n = Math.max(items.length, 1)
  const gap = p.gap ?? 0.3
  const itemW = (p.w - (n - 1) * gap) / n
  const cy = p.y + 0.06
  const nodes = items.flatMap((it, i) => {
    const x = p.x + i * (itemW + gap)
    const cx = x + itemW / 2
    return [
      h('ellipse', { x: cx - 0.05, y: cy - 0.05, w: 0.1, h: 0.1, fill: theme.colors.primary }),
      Text({ x, y: p.y + 0.28, w: itemW, fontSize: 12, bold: true, color: theme.colors.primary, align: 'center', children: it.date }, theme),
      Text({ x, y: p.y + 0.55, w: itemW, fontSize: 11, color: theme.colors.textSecondary, align: 'center', children: it.text }, theme),
    ]
  })
  return [HLine({ x: p.x, y: cy, w: p.w, color: theme.colors.line }, theme), ...nodes]
}

/** 特性网格：序号圆点 + 标题 + 描述 */
export const FeatureGrid: Widget = (p, theme) => {
  const items: { title: string; desc?: string }[] = p.items ?? []
  const cols = p.cols ?? 2
  const gap = p.gap ?? 0.3
  const colW = (p.w - (cols - 1) * gap) / cols
  const itemH = p.itemH ?? 1.5
  return items.flatMap((it, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = p.x + col * (colW + gap)
    const y = p.y + row * (itemH + gap)
    return [
      h('ellipse', { x, y: y + 0.05, w: 0.28, h: 0.28, fill: theme.colors.primary }),
      Text({ x: x + 0.45, y, w: colW - 0.45, fontSize: 15, bold: true, color: theme.colors.text, children: it.title }, theme),
      it.desc
        ? Text({ x: x + 0.45, y: y + 0.42, w: colW - 0.45, fontSize: 11, color: theme.colors.textSecondary, children: it.desc }, theme)
        : null,
    ]
  })
}
