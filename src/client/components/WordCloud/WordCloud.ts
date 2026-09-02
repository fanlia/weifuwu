/**
 * weifuwu/components — WordCloud
 *
 * 词云——权重→字号映射 · 确定性行式装箱布局 · SVG textLength 定宽
 * （渲染宽度精确 = 估算宽——同输入同输出——SSR≡SPA 零差异 + 词矩形零重叠）
 * 零依赖自绘 SVG（Chart 同族）。canvas 测宽/螺旋碰撞判负（服务端无 canvas——
 * 见 plan/2026-09-wordcloud-组件.md 判负记录）。
 *
 * 布局契约（纯函数——确定性——测试可断言）：
 * - 权重线性映射 [minFontSize, maxFontSize]（全等权重 → 全 maxFontSize）
 * - 降序装箱 逐行填充（行高 = 行内最大字号 × 1.2）——行内居中
 * - 高度自适应：viewBox = 实际排版宽高——height 为显示高度（等比缩放零丢弃）
 * - 词矩形（含 padding 间距）两两不相交（textLength 强制实际宽=估算宽）
 */
import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface WordCloudData {
  /** 词文本 */
  word: string
  /** 权重（≥0——0 不渲染） */
  weight: number
  /** 覆盖色板（不传按 colors 取模） */
  color?: string
}

export interface WordCloudProps {
  words: WordCloudData[]
  /** 布局宽（px——viewBox 坐标系）——默认 480 */
  width?: number
  /** 显示高度（px——SVG 等比缩放——默认自适应实际排版高） */
  height?: number
  /** 最大字号（px）——默认 32 */
  maxFontSize?: number
  /** 最小字号（px）——默认 12 */
  minFontSize?: number
  /** 词四周间距（px）——默认 4 */
  padding?: number
  /** 色板（默认 token 色阶——逐词取模） */
  colors?: string[]
  /** 点击词回调（提供后词可交互：hover 高亮 + 键盘 Enter/Space 可达） */
  onWordClick?: (word: string, weight: number) => void
  className?: string
}

/** 默认色板——SVG fill 走 CSS 变量（DOM 生效——SSR 同效——token 纪律零硬编码） */
const DEFAULT_COLORS = [
  'var(--wf-color-primary)',
  'var(--wf-color-success)',
  'var(--wf-color-info)',
  'var(--wf-color-warning)',
  'var(--wf-color-error)',
  'var(--wf-color-text-secondary)',
]

/** 字符宽系数（ASCII 0.62 / CJK 1.0——textLength 强制实际=估算——系数只影响美观排布） */
const ASCII_W = 0.62
const CJK_W = 1.0
const LINE_H = 1.2
/** 行基线偏移（字高 0.8——y = 行顶 + size × 0.8） */
const BASELINE = 0.8

function isCjk(ch: string): boolean {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(ch)
}

/** 估算词渲染宽（textLength 将强制实际=此值） */
export function estimateWordWidth(word: string, size: number): number {
  let w = 0
  for (const ch of word) w += isCjk(ch) ? size * CJK_W : size * ASCII_W
  return w
}

export interface PlacedWord {
  word: string
  weight: number
  /** 中心 x（text-anchor: middle） */
  x: number
  /** 基线 y */
  y: number
  size: number
  /** textLength（= 实际渲染字宽——不含 padding） */
  textLength: number
  /** 词级颜色（WordCloudData.color——透传——未传由色板兜底） */
  color?: string
  /** 布局矩形（含 padding——零重叠断言单位） */
  rect: { l: number; t: number; r: number; b: number }
}

/** 行式装箱布局（纯函数——确定性——同输入同输出——零重叠） */
export function layoutWords(
  words: WordCloudData[],
  opts: { width: number; maxFontSize: number; minFontSize: number; padding: number },
): { placed: PlacedWord[]; height: number } {
  const { width, maxFontSize, minFontSize, padding } = opts
  const active = words.filter((w) => w.weight > 0)
  if (!active.length) return { placed: [], height: 0 }
  const wMax = Math.max(...active.map((w) => w.weight))
  const wMin = Math.min(...active.map((w) => w.weight))
  const sizeFor = (wt: number): number => {
    if (wMax === wMin) return maxFontSize // 全等权重 → 同尺寸（Wordle 语义）
    const f = (wt - wMin) / (wMax - wMin)
    return minFontSize + (maxFontSize - minFontSize) * f
  }
  const sorted = [...active].sort((a, b) => b.weight - a.weight)
  // 行式装箱（含间距的块宽 = 字宽 + padding×2）
  const rows: Array<Array<{ d: WordCloudData; size: number; tw: number }>> = []
  let cur: Array<{ d: WordCloudData; size: number; tw: number }> = []
  let curW = 0
  const innerW = width - padding * 2
  for (const d of sorted) {
    const size = sizeFor(d.weight)
    const tw = estimateWordWidth(d.word, size) + padding * 2
    if (cur.length && curW + tw > innerW) { rows.push(cur); cur = []; curW = 0 }
    cur.push({ d, size, tw })
    curW += tw
  }
  if (cur.length) rows.push(cur)
  // 摆位（行高 = 行内最大字号 × LINE_H；行内居中）
  const placed: PlacedWord[] = []
  let yCursor = padding
  for (const row of rows) {
    const rowH = Math.max(...row.map((r) => r.size)) * LINE_H
    let xCursor = padding + Math.max(0, (innerW - row.reduce((s, r) => s + r.tw, 0)) / 2)
    for (const { d, size, tw } of row) {
      const textLength = tw - padding * 2
      const cx = xCursor + tw / 2
      const by = yCursor + size * BASELINE
      placed.push({
        word: d.word, weight: d.weight, color: d.color,
        x: cx, y: by, size, textLength,
        rect: { l: cx - tw / 2, t: yCursor, r: cx + tw / 2, b: yCursor + size },
      })
      xCursor += tw
    }
    yCursor += rowH
  }
  return { placed, height: yCursor + padding }
}

export const WordCloud: Component<WordCloudProps> = (_init, _ctx) =>
  (props: WordCloudProps) => {
    const {
      words, width = 480, height, maxFontSize = 32, minFontSize = 12,
      padding = 4, colors = DEFAULT_COLORS, onWordClick, className,
    } = props
    const { placed, height: layoutH } = layoutWords(words, { width, maxFontSize, minFontSize, padding })
    if (!placed.length) {
      return h('div', { class: `wf-wordcloud wf-wordcloud-empty ${className ?? ''}`.trim() }, '暂无词云数据')
    }
    const interactive = typeof onWordClick === 'function'
    const fire = (w: PlacedWord) => (_e: Event) => onWordClick?.(w.word, w.weight)
    const keyAct = (w: PlacedWord) => (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onWordClick?.(w.word, w.weight) }
    }
    return h('div', { class: `wf-wordcloud ${interactive ? 'wf-wordcloud--clickable' : ''} ${className ?? ''}`.trim() }, [
      h('svg', {
        width: '100%', height: height ?? layoutH,
        viewBox: `0 0 ${width} ${layoutH}`,
        preserveAspectRatio: 'xMidYMid meet',
        role: 'img', 'aria-label': '词云',
      }, placed.map((w, i) =>
        h('text', {
          key: w.word,
          x: w.x, y: w.y,
          'text-anchor': 'middle',
          fill: colors[i % colors.length],
          'font-size': w.size,
          'font-family': 'var(--wf-font-sans)',
          textLength: w.textLength,
          lengthAdjust: 'spacing',
          ...(interactive ? {
            role: 'button', tabindex: 0,
            onClick: fire(w),
            onKeyDown: keyAct(w),
            'aria-label': `${w.word}（权重 ${w.weight}）`,
          } : {}),
        }, w.word))),
    ])
  }
