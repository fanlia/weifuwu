/**
 * pptx-vdom components/primitives.ts — 基础组件
 *
 * 统一约定：组件签名 (props, theme) => VNode | VNode[]
 * 文本内容通过 props.children 传入；color/fill 支持主题 token 名
 * （'primary'/'text'...）或 #RRGGBB 色值。
 */

import { h, type PptxVNode } from '../vnode.ts'
import type { Theme } from '../theme.ts'
import { resolveColor } from '../theme.ts'

export type Prim = (props: any, theme: Theme) => any

/** 文本 — 默认色 theme.colors.text；内容走 props.children */
export const Text: Prim = (p, theme) =>
  h('text', {
    ...p,
    color: resolveColor(p.color, theme) ?? theme.colors.text,
  }, p.children)

/** 标题文本（大号加粗） */
export const Heading: Prim = (p, theme) =>
  Text({ fontSize: 28, bold: true, color: theme.colors.text, ...p }, theme)

/** 章节标签（小号加粗，常用主题色） */
export const Eyebrow: Prim = (p, theme) =>
  Text({ fontSize: 12, bold: true, color: theme.colors.primary, ...p }, theme)

/** 圆角胶囊标签（填充浅色底 + 主色字） */
export const Pill: Prim = (p, theme) =>
  h('roundedRect', {
    radius: 0.5,
    ...p,
    fill: resolveColor(p.fill, theme) ?? theme.colors.primarySoft,
    color: resolveColor(p.color, theme) ?? theme.colors.primary,
    fontSize: p.fontSize ?? 11,
    bold: p.bold ?? true,
    valign: 'middle',
  }, p.label ?? p.children)

/** 矩形块（fill 支持 token） */
export const Rect: Prim = (p, theme) =>
  h('rect', { ...p, fill: resolveColor(p.fill, theme), lineColor: resolveColor(p.lineColor, theme) })

/** 水平分隔线：从 (x, y) 到 (x+w, y) */
export const HLine: Prim = (p, theme) =>
  h('line', {
    x1: p.x,
    y1: p.y,
    x2: p.x + (p.w ?? 3),
    y2: p.y,
    color: resolveColor(p.color, theme) ?? theme.colors.line,
    weight: p.weight ?? 1,
  })

/** 项目符号列表（points 走 props.points） */
export const Bullets: Prim = (p, theme) =>
  h('bullets', { ...p, color: resolveColor(p.color, theme) ?? theme.colors.textSecondary })

/**
 * 页脚：分隔线 + 标题 + 页码
 * 返回多个元素（数组）
 */
export const Footer: Prim = (p, theme) => {
  const y = p.y ?? 7.02
  const x = p.x ?? 0.6
  return [
    HLine({ x, y, w: 12.13, color: theme.colors.line }, theme),
    Text({ x, y: y + 0.1, w: 8, fontSize: 9, color: theme.colors.muted, children: p.title ?? '' }, theme),
    Text({ x: 11.6, y: y + 0.1, w: 1.13, fontSize: 9, color: theme.colors.muted, align: 'right', children: String(p.page ?? 1) }, theme),
  ]
}
