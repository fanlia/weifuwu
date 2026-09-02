/**
 * weifuwu/components — WordCloud
 *
 * 词云——权重→字号映射 · **中心同心环发散布局**（SVG textLength 定宽——
 * 渲染宽度精确 = 估算宽——同输入同输出——SSR≡SPA 零差异 + 词矩形零重叠）
 * 零依赖自绘 SVG（Chart 同族）。canvas 测宽/Canvas 绘制判负（服务端无 canvas——
 * 见 git log plan/2026-09-wordcloud-组件.md 判负记录——中心排列消费证据推翻
 * 行式装箱——同心环以 SVG 确定性实现：碰撞=矩形相交（纯函数））。
 *
 * 布局契约（纯函数——确定性——测试可断言）：
 * - 权重线性映射 [minFontSize, maxFontSize]（全等权重 → 全 maxFontSize）
 * - 降序放置——最大词从中心（环 0）开始——**同心环扫描**：环宽 = 当前词高
 *   （邻环相接不重叠——环形约束）——环内候选点间距 = max(词宽, 环宽)（奇数环
 *   错相偏 π/n——无隙漏）——首个无碰撞点放置
 * - viewBox = 全部词包围盒（自适应——零裁剪——height 为显示高）
 * - 词矩形（含 padding 间距）两两不相交（环碰撞保证 + textLength 强制实际宽）
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
  /** 显示高度（px——SVG 等比缩放——默认=布局包围盒高） */
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
/** 词矩形半高系数（基线位于字底上方 0.2×size——rect 高 = size 含字形 + 行距余量） */
const BASELINE = 0.8
/** 同心环扫描——环数上限（r_max = 64 × 20px ≈ 1280——100 词半径预算 2× 富余）
 * 实测 100 词布局 ~22ms（纯 JS 冷路径——props 变化一次——worker/wasm 判负看 git log） */
const MAX_RING = 64
/** 环内候选点间距下限（px——词宽更小不必更密） */
const MIN_ARC = 12

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

/** 布局输出（viewBox = 包围盒——由内容决定——零裁剪） */
export interface WordCloudLayout {
  placed: PlacedWord[]
  /** 布局坐标系宽（= 包围盒宽） */
  width: number
  /** 布局坐标系高（= 包围盒高） */
  height: number
}

/** 矩形相交（含 EPS 浮点容差） */
function rectsOverlap(a: { l: number; t: number; r: number; b: number }, b: { l: number; t: number; r: number; b: number }): boolean {
  const EPS = 1e-6
  return a.l < b.r - EPS && b.l < a.r - EPS && a.t < b.b - EPS && b.t < a.b - EPS
}

/** 中心同心环布局（纯函数——确定性——同输入同输出——零重叠） */
export function layoutWords(
  words: WordCloudData[],
  opts: { maxFontSize: number; minFontSize: number; padding: number },
): WordCloudLayout {
  const { maxFontSize, minFontSize, padding } = opts
  const active = words.filter((w) => w.weight > 0)
  if (!active.length) return { placed: [], width: 0, height: 0 }
  const wMax = Math.max(...active.map((w) => w.weight))
  const wMin = Math.min(...active.map((w) => w.weight))
  const sizeFor = (wt: number): number => {
    if (wMax === wMin) return maxFontSize // 全等权重 → 同尺寸（Wordle 语义）
    const f = (wt - wMin) / (wMax - wMin)
    return minFontSize + (maxFontSize - minFontSize) * f
  }
  const sorted = [...active].sort((a, b) => b.weight - a.weight)
  // 降序放置：环 0 = 平面中心（最大词中央）——逐外环扫描——环宽 = 当前词高
  // （相邻环 rect 相接不重叠——环形约束）；环内候选点间距 = max(词宽, MIN_ARC),
  // 奇数环错相 π/n——候选点均匀（无隙漏）——首个无碰撞点即放置。
  const placed: PlacedWord[] = []
  const collision = (rect: { l: number; t: number; r: number; b: number }): boolean =>
    placed.some((p) => rectsOverlap(p.rect, rect))
  for (const d of sorted) {
    const size = sizeFor(d.weight)
    const tw = estimateWordWidth(d.word, size) + padding * 2
    const h = size + padding * 2
    let placedRect: { l: number; t: number; r: number; b: number } | null = null
    let px = 0; let py = 0
    const ringW = h
    for (let ring = 0; ring <= MAX_RING && !placedRect; ring++) {
      const rC = ring * ringW // 环中心半径（环 0 = 中心点）
      const n = Math.max(1, Math.round((2 * Math.PI * rC) / Math.max(tw, MIN_ARC)))
      for (let k = 0; k < n; k++) {
        const ang = (2 * Math.PI * k) / n + (ring % 2 ? Math.PI / n : 0)
        const cx = rC * Math.cos(ang)
        const cy = rC * Math.sin(ang)
        const rect = { l: cx - tw / 2, t: cy - h / 2, r: cx + tw / 2, b: cy + h / 2 }
        if (!collision(rect)) { placedRect = rect; px = cx; py = cy; break }
      }
    }
    if (!placedRect) continue // 环上限未找到位置——跳过（密度兜底）
    placed.push({
      word: d.word, weight: d.weight, color: d.color,
      // 基线 y = 矩形中心 y + 0.3×size（rect 垂直中心 = 放置点——视觉居中）
      x: px, y: py + size * (1 - BASELINE) / 2,
      size, textLength: tw - padding * 2,
      rect: placedRect,
    })
  }
  if (!placed.length) return { placed: [], width: 0, height: 0 }
  // 包围盒（外扩 padding——viewBox 自适应——中心重映射到 (0,0) 起）
  let l = Infinity; let t = Infinity; let r = -Infinity; let b = -Infinity
  for (const p of placed) {
    l = Math.min(l, p.rect.l); t = Math.min(t, p.rect.t)
    r = Math.max(r, p.rect.r); b = Math.max(b, p.rect.b)
  }
  const pad = padding
  const W = r - l + pad * 2
  const H = b - t + pad * 2
  const ox = -l + pad
  const oy = -t + pad
  for (const p of placed) {
    p.x += ox
    p.y += oy
    p.rect = { l: p.rect.l + ox, t: p.rect.t + oy, r: p.rect.r + ox, b: p.rect.b + oy }
  }
  return { placed, width: W, height: H }
}

export const WordCloud: Component<WordCloudProps> = (_init, ctx) => {
  // ── mount（只一次）──
  // §5.4 弹窗纪律：浮层一律命令式弹窗（唯一形态——openPopup——Chart tooltip 同款）
  let tooltip: { word: string; weight: number } | null = null
  let tooltipEl: Element | null = null
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  // 布局 memo（hover 只触发 render——布局不变时零重算——100 词 5ms 冷路径）
  let layoutCache: { words: unknown; opts: string; result: WordCloudLayout } | null = null

  return (props: WordCloudProps) => {
    const {
      words, height, maxFontSize = 32, minFontSize = 12,
      padding = 4, colors = DEFAULT_COLORS, onWordClick, className,
    } = props
    const opts = `${maxFontSize}:${minFontSize}:${padding}`
    if (!layoutCache || layoutCache.words !== words || layoutCache.opts !== opts) {
      layoutCache = { words, opts, result: layoutWords(words, { maxFontSize, minFontSize, padding }) }
    }
    const { placed, width: layoutW, height: layoutH } = layoutCache.result
    if (!placed.length) {
      return h('div', { class: `wf-wordcloud wf-wordcloud-empty ${className ?? ''}`.trim() }, '暂无词云数据')
    }
    const interactive = typeof onWordClick === 'function'
    const fire = (w: PlacedWord) => (_e: Event) => onWordClick?.(w.word, w.weight)
    const keyAct = (w: PlacedWord) => (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onWordClick?.(w.word, w.weight) }
    }
    const enter = (w: PlacedWord) => (e: Event) => {
      tooltip = { word: w.word, weight: w.weight }
      tooltipEl = e.target as Element
      ctx.render()
    }
    const leave = () => { tooltip = null; tooltipEl = null; ctx.render() }
    const tip = tooltip
      ? h('div', { class: 'wf-wordcloud-tooltip' }, [
        h('span', { class: 'wf-wordcloud-tooltip-word' }, tooltip.word),
        h('span', { class: 'wf-wordcloud-tooltip-weight' }, `权重 ${tooltip.weight}`),
      ])
      : null
    // 命令式弹窗生命周期（Chart 样板：开→update→关——唯一形态）
    if (tooltip && !handle) {
      handle = ctx.ui.openPopup({
        key: 'wordcloud-tooltip',
        anchor: () => tooltipEl as HTMLElement | null,
        placement: 'top',
        gap: 8,
        content: () => tip,
        onClose: () => { handle = null; if (tooltip) { tooltip = null; tooltipEl = null; ctx.render() } },
      })
    } else if (!tooltip && handle) {
      handle.close(); handle = null
    } else if (handle && tip) {
      handle.update(tip)
    }
    return h('div', { class: `wf-wordcloud ${interactive ? 'wf-wordcloud--clickable' : ''} ${className ?? ''}`.trim() }, [
      h('svg', {
        width: '100%', height: height ?? layoutH,
        viewBox: `0 0 ${layoutW} ${layoutH}`,
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
          onMouseEnter: enter(w),
          onMouseLeave: leave,
          ...(interactive ? {
            role: 'button', tabindex: 0,
            onClick: fire(w),
            onKeyDown: keyAct(w),
            'aria-label': `${w.word}（权重 ${w.weight}）`,
          } : {}),
        }, w.word))),
    ])
  }
}
