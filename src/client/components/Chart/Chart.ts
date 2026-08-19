/**
 * weifuwu/components — Chart
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

import {
  scaleLinear, linePath, areaPath, barRects, pieArcs,
  getYTicks, getDefaultColor,
} from './chart-utils.ts'
import type { DataPoint, ChartType, ChartOptions } from './chart-utils.ts'

export type { DataPoint, ChartType, ChartOptions }

export interface ChartProps {
  type?: ChartType
  data: DataPoint[]
  options?: ChartOptions
  title?: string
  area?: boolean
  className?: string
}

export const Chart: Component<ChartProps> = async (_props, ctx) => {
  // ── mount（只一次）──
  let tooltip: { label: string; value: number; color?: string } | null = null
  let tooltipEl: Element | null = null

  // §5.4 弹窗纪律：浮层一律 usePopup（统一组合器——定位/视口夹紧/Escape/portal）——
  // tooltip 悬浮跟随数据点（hover 手动触发——isOpen 驱动）——参照组件库 Tooltip
  const popup = ctx.ui.usePopup({
    trigger: 'manual', // hover 由数据点事件手动管理（line/bar/pie 的 onMouseEnter）
    placement: 'top',
    gap: 8,
    el: () => tooltipEl as HTMLElement | null,
    isOpen: () => tooltip !== null,
    setOpen: (v) => {
      if (!v && tooltip !== null) { tooltip = null; tooltipEl = null; ctx.render() }
    },
  })

  // ── render（每次 dirty/props 变化）──
  return async (props: ChartProps) => {
    const { type = 'line', data, options = {}, title, area, className } = props

    const W = options.width ?? 320
    const H = options.height ?? 200
    const pad = options.padding ?? 32
    const cw = W - pad * 2
    const ch = H - pad * 2

    const values = data.map(d => d.value)
    const minVal = Math.min(0, ...values)
    const maxVal = Math.max(...values)
    const valRange = maxVal - minVal || 1

    const renderLine = () => {
      const n = Math.max(1, data.length - 1)
      const xScale = scaleLinear([-0.5, n + 0.5], [0, cw])
      const yScale = scaleLinear([minVal, maxVal], [ch, 0])
      const ticks = getYTicks(yScale)

      const lineD = linePath(data, xScale, yScale)
      const areaD = area ? areaPath(data, xScale, yScale, yScale(0)) : null

      const dots = data.map((d, i) => {
        const cx = xScale(i) + pad
        const cy = yScale(d.value) + pad
        const enter = (e: Event) => {
          tooltipEl = e.target as Element
          tooltip = { label: d.label, value: d.value, color: d.color ?? getDefaultColor(i) }
          ctx.render()
        }
        const leave = () => { tooltipEl = null; tooltip = null; ctx.render() }
        return h('g', { key: `dot-${i}` }, [
          // 视觉点
          h('circle', {
            cx, cy, r: 3,
            fill: d.color ?? getDefaultColor(i),
            style: { stroke: 'var(--wf-color-bg)' },
            'stroke-width': 1.5,
            'pointer-events': 'none',
          }),
          // 透明命中区（r=3 太小难悬停——扩大交互目标，覆盖相邻点先到先得）
          h('circle', {
            cx, cy, r: 9,
            fill: 'transparent',
            style: { cursor: 'pointer' },
            onMouseEnter: enter,
            onMouseLeave: leave,
          }),
        ])
      })

      return h('svg', { style: { width: '100%' }, height: H, viewBox: `0 0 ${W} ${H}` }, [
        ...ticks.map((t, i) => h('g', { key: `tick-${i}` }, [
          h('line', {
            x1: pad, y1: t.y + pad, x2: W - pad, y2: t.y + pad,
            style: { stroke: 'var(--wf-color-border)' },
            'stroke-width': 1,
          }),
          h('text', {
            x: pad - 6, y: t.y + pad + 4,
            'text-anchor': 'end', style: { fill: 'var(--wf-color-text-tertiary)' },
            'font-size': '11', 'font-family': 'var(--wf-font-sans)',
          }, t.label),
        ])),
        ...(areaD ? [h('path', {
          key: 'area', d: areaD,
          style: { fill: 'var(--wf-color-primary-bg)' },
          stroke: 'none',
          transform: `translate(${pad},${pad})`,
        })] : []),
        h('path', {
          key: 'line', d: lineD,
          fill: 'none',
          style: { stroke: 'var(--wf-color-primary)' },
          'stroke-width': 2,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          transform: `translate(${pad},${pad})`,
        }),
        ...data.map((d, i) => {
          const x = xScale(i) + pad
          return h('text', {
            key: `xlabel-${i}`,
            x, y: H - pad + 14,
            'text-anchor': 'middle', style: { fill: 'var(--wf-color-text-tertiary)' },
            'font-size': '10', 'font-family': 'var(--wf-font-sans)',
          }, d.label)
        }),
        ...dots,
      ])
    }

    const renderBar = () => {
      const n = Math.max(1, data.length - 1)
      const xScale = scaleLinear([-0.5, n + 0.5], [0, cw])
      const yScale = scaleLinear([minVal, maxVal], [ch, 0])
      const ticks = getYTicks(yScale)
      const rects = barRects(data, xScale, yScale)

      return h('svg', { style: { width: '100%' }, height: H, viewBox: `0 0 ${W} ${H}` }, [
        ...ticks.map((t, i) => h('g', { key: `tick-${i}` }, [
          h('line', {
            x1: pad, y1: t.y + pad, x2: W - pad, y2: t.y + pad,
            style: { stroke: 'var(--wf-color-border)' },
            'stroke-width': 1,
          }),
          h('text', {
            x: pad - 6, y: t.y + pad + 4,
            'text-anchor': 'end', style: { fill: 'var(--wf-color-text-tertiary)' },
            'font-size': '11', 'font-family': 'var(--wf-font-sans)',
          }, t.label),
        ])),
        ...rects.map((r, i) => h('rect', {
          key: `bar-${i}`,
          x: r.x + pad, y: r.y + pad, width: r.width, height: r.height,
          fill: r.color, rx: 2,
          onMouseEnter: (e: Event) => {
            tooltipEl = e.target as Element
            tooltip = { label: r.label, value: r.value, color: r.color }; ctx.render()
          },
          onMouseLeave: () => { tooltipEl = null; tooltip = null; ctx.render() },
        })),
        ...data.map((d, i) => {
          const x = xScale(i) + pad
          return h('text', {
            key: `xlabel-${i}`,
            x, y: H - pad + 14,
            'text-anchor': 'middle', style: { fill: 'var(--wf-color-text-tertiary)' },
            'font-size': '10', 'font-family': 'var(--wf-font-sans)',
          }, d.label)
        }),
      ])
    }

    const renderPie = () => {
      const cx = W / 2
      const cy = H / 2
      const radius = Math.min(cw, ch) / 2 - 4
      const arcs = pieArcs(data, cx, cy, radius)

      return h('svg', { style: { width: '100%' }, height: H, viewBox: `0 0 ${W} ${H}` }, [
        ...arcs.map((a, i) => h('g', { key: `arc-${i}` }, [
          h('path', {
            d: a.d, fill: a.color,
            style: { stroke: 'var(--wf-color-bg)' },
            'stroke-width': 1.5,
            onMouseEnter: (e: Event) => {
              tooltipEl = e.target as Element
              tooltip = { label: a.label, value: a.value, color: a.color }; ctx.render()
            },
            onMouseLeave: () => { tooltipEl = null; tooltip = null; ctx.render() },
          }),
          ...(a.value / data.reduce((s, d) => s + Math.abs(d.value), 0) > 0.05
            ? [h('text', {
              x: a.centroid.x, y: a.centroid.y + 3,
              'text-anchor': 'middle', style: { fill: 'var(--wf-color-on-brand)' },
              'font-size': '11', 'font-weight': 'bold',
              'font-family': 'var(--wf-font-sans)',
              // 装饰性文字不拦截鼠标——否则覆盖的弧区 hover 无 tooltip
              // （text 与 path 是同级——mouseover 不会冒泡到 arc——真实 hover 静默失效）
              'pointer-events': 'none',
            }, `${Math.round(a.value / data.reduce((s, d) => s + Math.abs(d.value), 0) * 100)}%`)]
            : []),
        ])),
      ])
    }

    // ── radar：多轴雷达图（SVG 多边形——数据点 label 为轴名） ──
    const renderRadar = () => {
      const W = 300, H = 260, CX = W / 2, CY = H / 2 + 10, R = 95
      const max = Math.max(...data.map((d) => Math.abs(d.value)), 1)
      const n = data.length
      const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2
      const point = (i: number, ratio: number) => [CX + Math.cos(angle(i)) * R * ratio, CY + Math.sin(angle(i)) * R * ratio] as const
      // 网格层（n 边形 × 3 环）
      const rings = [0.33, 0.66, 1].map((r) =>
        h('polygon', { key: `ring-${r}`, points: Array.from({ length: n }, (_, i) => point(i, r).join(',')).join(' '), fill: 'none', stroke: 'var(--wf-color-border)', 'stroke-width': 1 }))
      const spokes = Array.from({ length: n }, (_, i) =>
        h('line', { key: `spoke-${i}`, x1: CX, y1: CY, x2: point(i, 1)[0], y2: point(i, 1)[1], stroke: 'var(--wf-color-border)', 'stroke-width': 1 }))
      // 数据多边形
      const dataPoly = data.map((d, i) => point(i, Math.abs(d.value) / max).join(',')).join(' ')
      const labels = data.map((d, i) => {
        const [x, y] = point(i, 1.18)
        return h('text', { key: `lb-${i}`, x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'wf-chart-label', 'font-size': 10 }, d.label)
      })
      return h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wf-chart-svg', role: 'img' }, [
        ...rings, ...spokes,
        h('polygon', { key: 'data', points: dataPoly, fill: 'var(--wf-color-primary-bg)', stroke: 'var(--wf-color-primary)', 'stroke-width': 1.5, opacity: 0.85 }),
        ...labels,
      ])
    }

    // ── gauge：仪表盘（半圆弧 + 指针） ──
    const renderGauge = () => {
      const W = 300, H = 180, CX = W / 2, CY = H - 10, R = 130
      const value = data[0]?.value ?? 0
      const min = options?.min ?? 0
      const max = options?.max ?? 100
      const ratio = Math.min(Math.max((value - min) / (max - min), 0), 1)
      // 背景弧 + 值弧（arc 路径——简单圆角线）
      const arcPath = (r: number, from: number, to: number) => {
        const a = (ratio2: number) => Math.PI * (1 - ratio2)
        const [x1, y1] = [CX - Math.cos(a(from)) * r, CY - Math.sin(a(from)) * r]
        const [x2, y2] = [CX - Math.cos(a(to)) * r, CY - Math.sin(a(to)) * r]
        const large = Math.abs(a(from) - a(to)) > Math.PI ? 1 : 0
        return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
      }
      const valArc = arcPath(R - 12, 0, ratio)
      const bgArc = arcPath(R - 12, 0, 1)
      // 指针角度（-90° 起点，顺时针 180°）
      const pa = -Math.PI / 2 + ratio * Math.PI
      const [px, py] = [CX + Math.cos(pa) * (R - 30), CY + Math.sin(pa) * (R - 30)]
      return h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wf-chart-svg', role: 'img' }, [
        h('path', { key: 'bg', d: bgArc, fill: 'none', stroke: 'var(--wf-color-border)', 'stroke-width': 12, 'stroke-linecap': 'round' }),
        h('path', { key: 'val', d: valArc, fill: 'none', stroke: 'var(--wf-color-primary)', 'stroke-width': 12, 'stroke-linecap': 'round' }),
        h('line', { key: 'needle', x1: CX, y1: CY, x2: px, y2: py, stroke: 'var(--wf-color-text)', 'stroke-width': 3, 'stroke-linecap': 'round' }),
        h('text', { key: 'val-t', x: CX, y: CY + 38, 'text-anchor': 'middle', class: 'wf-chart-value', 'font-size': 22, 'font-weight': 600 }, `${value}`),
        h('text', { key: 'min', x: 24, y: CY - 6, 'text-anchor': 'middle', class: 'wf-chart-label', 'font-size': 10 }, `${min}`),
        h('text', { key: 'max', x: W - 24, y: CY - 6, 'text-anchor': 'middle', class: 'wf-chart-label', 'font-size': 10 }, `${max}`),
      ])
    }

    // ── scatter：散点图（x/y 双数值——value 为 y，label 为 x 数值） ──
    const renderScatter = () => {
      const W = 320, H = 220, PAD = 34
      const maxY = Math.max(...data.map((d) => Math.abs(d.value)), 1) * 1.1
      const maxX = Math.max(...data.map((d) => Number(d.label) || 0), data.length, 1) * 1.1
      const xOf = (i: number) => PAD + (Number(data[i]?.label) || i) / maxX * (W - PAD * 2)
      const yOf = (v: number) => H - PAD - Math.abs(v) / maxY * (H - PAD * 2)
      const dots = data.map((d, i) =>
        h('circle', { key: `dot-${i}`, cx: xOf(i), cy: yOf(d.value), r: 4.5, fill: d.color ?? getDefaultColor(i),
          onMouseEnter: () => { tooltip = { label: d.label, value: d.value }; ctx.render() },
          onMouseLeave: () => { tooltip = null; ctx.render() } }))
      const yTicks = [0, 0.5, 1].map((r) => {
        const y = yOf(r * maxY)
        return h('g', { key: `yt-${r}` }, [
          h('line', { x1: PAD, y1: y, x2: W - PAD, y2: y, stroke: 'var(--wf-color-border)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
          h('text', { x: PAD - 6, y: y + 3, 'text-anchor': 'end', class: 'wf-chart-label', 'font-size': 10 }, `${Math.round(r * maxY)}`),
        ])
      })
      return h('svg', { viewBox: `0 0 ${W} ${H}`, class: 'wf-chart-svg', role: 'img' }, [...yTicks, ...dots])
    }

    let chartContent: any
    if (type === 'bar') chartContent = renderBar()
    else if (type === 'pie') chartContent = renderPie()
    else if (type === 'radar') chartContent = renderRadar()
    else if (type === 'gauge') chartContent = renderGauge()
    else if (type === 'scatter') chartContent = renderScatter()
    else chartContent = renderLine()

    const legend = data.length > 1 ? h('div', { class: 'wf-chart-legend' },
      data.map((d, i) => h('span', { class: 'wf-chart-legend-item', key: `leg-${i}` }, [
        h('span', { class: 'wf-chart-legend-dot', style: { background: d.color ?? getDefaultColor(i) } }),
        h('span', { class: 'wf-chart-legend-label' }, d.label),
      ]))
    ) : null

    // ── tooltip（usePopup 统一弹层——portal 渲染——isOpen 驱动） ──
    const tip = tooltip ? h('div', {
      class: 'wf-chart-tooltip',
    }, [
      h('div', { class: 'wf-chart-tooltip-label' }, [
        tooltip.color ? h('span', { class: 'wf-chart-tooltip-dot', style: { background: tooltip.color } }) : null,
        h('span', {}, tooltip.label),
      ]),
      h('div', { class: 'wf-chart-tooltip-value' }, String(tooltip.value)),
    ]) : null

    return h('div', {
      class: `wf-chart${className ? ' ' + className : ''}`,
      role: 'img',
      'aria-expanded': String(!!tooltip),
      'aria-label': title ?? (ctx as any)?.i18n?.components?.Chart?.ariaLabel ?? '图表',
    }, [
      title ? h('div', { class: 'wf-chart-title' }, title) : null,
      chartContent,
      legend,
      tip ? popup.portal(tip, 'chart-tooltip') : null,
    ].filter(Boolean))
  }
}
