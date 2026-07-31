/**
 * pptx-vdom components/layouts.ts — 版式组件 + 语义 JSON → deck 工厂
 *
 * 这是 LLM 的边界：LLM 只产 SlideData（语义 JSON），由 renderLayout 映射到
 * 版式组件，版式再渲染为 slide XML。质量在组件库手里，不在 LLM 手里。
 */

import { h, type PptxVNode } from '../vnode.ts'
import type { Theme } from '../theme.ts'
import { getTheme, themes } from '../theme.ts'
import { Text, Heading, HLine, Bullets, Rect, Pill, Footer } from './primitives.ts'
import { StatCard } from './widgets.ts'
import { gridPos } from '../layout.ts'
import { renderSlide } from '../renderXml.ts'
import { buildPptx } from '../packager.ts'

// ── 语义 JSON（LLM 产出契约）─────────────────────────────

export type SlideData =
  | { layout: 'cover'; title: string; subtitle?: string; meta?: string }
  | { layout: 'section'; number: number; title: string; subtitle?: string }
  | { layout: 'bullets'; title: string; points: string[] }
  | {
      layout: 'twoColumn'
      title: string
      leftTitle: string
      leftPoints: string[]
      rightTitle: string
      rightPoints: string[]
    }
  | { layout: 'data'; title: string; stats: { label: string; value: string; delta?: string }[] }
  | { layout: 'thanks'; title: string; subtitle?: string }

export interface DeckData {
  title?: string
  theme: string
  slides: SlideData[]
}

/** 语义 JSON 校验（LLM 输出的守卫） */
export function validateDeck(deck: unknown): asserts deck is DeckData {
  if (typeof deck !== 'object' || deck === null) throw new Error('validateDeck: deck 必须是对象')
  const d = deck as Record<string, any>
  if (!Array.isArray(d.slides) || d.slides.length === 0) throw new Error('validateDeck: slides 必须是非空数组')
  const layouts = new Set(['cover', 'section', 'bullets', 'twoColumn', 'data', 'thanks'])
  for (const [i, s] of d.slides.entries()) {
    if (typeof s !== 'object' || s === null || typeof s.layout !== 'string') {
      throw new Error(`validateDeck: slides[${i}] 缺少 layout 字段`)
    }
    if (!layouts.has(s.layout)) throw new Error(`validateDeck: slides[${i}] layout 非法: ${s.layout}`)
    if (typeof s.title !== 'string' || s.title.trim() === '') {
      throw new Error(`validateDeck: slides[${i}] 缺少非空 title`)
    }
    if (s.layout === 'bullets') {
      if (!Array.isArray(s.points) || s.points.some((p: unknown) => typeof p !== 'string')) {
        throw new Error(`validateDeck: slides[${i}] points 必须是字符串数组`)
      }
    }
    if (s.layout === 'twoColumn') {
      for (const key of ['leftTitle', 'rightTitle']) {
        if (typeof s[key] !== 'string' || s[key].trim() === '') throw new Error(`validateDeck: slides[${i}] ${key} 缺失`)
      }
      for (const key of ['leftPoints', 'rightPoints']) {
        if (!Array.isArray(s[key]) || s[key].some((p: unknown) => typeof p !== 'string')) {
          throw new Error(`validateDeck: slides[${i}] ${key} 必须是字符串数组`)
        }
      }
    }
    if (s.layout === 'data') {
      if (!Array.isArray(s.stats) || s.stats.some((st: any) => typeof st?.label !== 'string' || typeof st?.value !== 'string')) {
        throw new Error(`validateDeck: slides[${i}] stats 必须是 {label,value} 数组`)
      }
    }
  }
  if (typeof d.theme !== 'string' || !(d.theme in themes)) throw new Error(`validateDeck: 未知主题 ${d.theme}`)
}

// ── 版式组件（每个返回 slide VNode）───────────────────────

const pageW = 13.333

function CoverSlide(d: Extract<SlideData, { layout: 'cover' }>, theme: Theme): PptxVNode {
  return h('slide', { bg: theme.colors.bg },
    Rect({ x: 0, y: 0, w: pageW, h: 0.12, fill: 'primary' }, theme),
    Pill({ x: 1, y: 1.7, w: 2.0, h: 0.42, label: 'AI 生成' }, theme),
    Text({ x: 1, y: 2.45, w: 11.3, h: 1.3, fontSize: 42, bold: true, color: theme.colors.text, children: d.title }, theme),
    d.subtitle
      ? Text({ x: 1, y: 3.85, w: 11.3, fontSize: 18, color: theme.colors.textSecondary, children: d.subtitle }, theme)
      : null,
    d.meta ? Text({ x: 1, y: 6.6, w: 11.3, fontSize: 11, color: theme.colors.muted, children: d.meta }, theme) : null,
  )
}

function SectionSlide(d: Extract<SlideData, { layout: 'section' }>, theme: Theme): PptxVNode {
  return h('slide', { bg: theme.colors.bg },
    Text({ x: 0.8, y: 1.2, w: 6, fontSize: 110, bold: true, color: theme.colors.primarySoft, children: String(d.number).padStart(2, '0') }, theme),
    Rect({ x: 1, y: 3.55, w: 0.9, h: 0.1, fill: 'primary' }, theme),
    Text({ x: 1, y: 3.85, w: 11.3, h: 0.9, fontSize: 36, bold: true, color: theme.colors.text, children: d.title }, theme),
    d.subtitle ? Text({ x: 1, y: 4.85, w: 11.3, fontSize: 14, color: theme.colors.textSecondary, children: d.subtitle }, theme) : null,
  )
}

function BulletsSlide(d: Extract<SlideData, { layout: 'bullets' }>, theme: Theme): PptxVNode {
  return h('slide', { bg: theme.colors.bg },
    Heading({ x: 0.6, y: 0.45, w: 12.1, h: 0.7, children: d.title }, theme),
    HLine({ x: 0.6, y: 1.15, w: 3.6, color: 'primary', weight: 2.5 }, theme),
    Bullets({ x: 0.6, y: 1.65, w: 12.1, h: 4.8, fontSize: 17, gap: 1.6, points: d.points }, theme),
  )
}

function TwoColumnSlide(d: Extract<SlideData, { layout: 'twoColumn' }>, theme: Theme): PptxVNode {
  const colX = 0.6
  const colW = 5.7
  return h('slide', { bg: theme.colors.bg },
    Heading({ x: colX, y: 0.45, w: 12.1, h: 0.7, children: d.title }, theme),
    HLine({ x: colX, y: 1.15, w: 3.6, color: 'primary', weight: 2.5 }, theme),
    h('line', { x1: 6.7, y1: 1.5, x2: 6.7, y2: 6.6, color: theme.colors.line }),
    Text({ x: colX, y: 1.6, w: colW, h: 0.5, fontSize: 18, bold: true, color: theme.colors.text, children: d.leftTitle }, theme),
    Bullets({ x: colX, y: 2.2, w: colW, h: 4.2, fontSize: 14, gap: 0.45, points: d.leftPoints }, theme),
    Text({ x: 7.1, y: 1.6, w: 5.6, h: 0.5, fontSize: 18, bold: true, color: theme.colors.text, children: d.rightTitle }, theme),
    Bullets({ x: 7.1, y: 2.2, w: 5.6, h: 4.2, fontSize: 14, gap: 0.45, points: d.rightPoints }, theme),
  )
}

function DataSlide(d: Extract<SlideData, { layout: 'data' }>, theme: Theme): PptxVNode {
  const stats = d.stats
    .map((s, i) => StatCard({ ...s, ...gridPos(i, { x: 0.6, y: 1.7, w: 12.1, cols: 3, gap: 0.35, itemH: 1.9 }) }, theme))
    .flat()
  return h('slide', { bg: theme.colors.bg },
    Heading({ x: 0.6, y: 0.45, w: 12.1, h: 0.7, children: d.title }, theme),
    HLine({ x: 0.6, y: 1.15, w: 3.6, color: 'primary', weight: 2.5 }, theme),
    ...stats,
  )
}

function ThanksSlide(d: Extract<SlideData, { layout: 'thanks' }>, theme: Theme): PptxVNode {
  return h('slide', { bg: theme.colors.bg },
    Text({ x: 4.17, y: 2.9, w: 5, h: 0.9, fontSize: 40, bold: true, color: theme.colors.text, align: 'center', children: d.title }, theme),
    d.subtitle
      ? Text({ x: 4.17, y: 3.9, w: 5, fontSize: 14, color: theme.colors.textSecondary, align: 'center', children: d.subtitle }, theme)
      : null,
  )
}

function renderLayout(slide: SlideData, theme: Theme): PptxVNode {
  switch (slide.layout) {
    case 'cover': return CoverSlide(slide, theme)
    case 'section': return SectionSlide(slide, theme)
    case 'bullets': return BulletsSlide(slide, theme)
    case 'twoColumn': return TwoColumnSlide(slide, theme)
    case 'data': return DataSlide(slide, theme)
    case 'thanks': return ThanksSlide(slide, theme)
  }
}

/** 需要页脚的版式（封面/章节/结束页不加） */
const WITH_FOOTER = new Set(['bullets', 'twoColumn', 'data'])

function withFooter(slide: PptxVNode, opts: { title?: string; page: number }, theme: Theme): PptxVNode {
  const children = slide.props.children
  const kids: any[] = Array.isArray(children) ? children : [children]
  return { ...slide, props: { ...slide.props, children: [...kids, ...Footer({ title: opts.title, page: opts.page }, theme)] } }
}

/**
 * 语义 JSON → .pptx Buffer（LLM 输出直接喂这里）
 */
export function deckToPptx(deck: DeckData): Buffer {
  validateDeck(deck)
  const theme = getTheme(deck.theme)
  const slides = deck.slides.map((s, i) => {
    let slide = renderLayout(s, theme)
    if (WITH_FOOTER.has(s.layout)) slide = withFooter(slide, { title: deck.title, page: i + 1 }, theme)
    return renderSlide(slide)
  })
  return buildPptx(slides, deck.title ? { title: deck.title } : {})
}
