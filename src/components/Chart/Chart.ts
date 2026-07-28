/**
 * weifuwu/components — Chart
 *
 * SVG 图表组件，支持 line / bar / pie / donut 四种模式。
 * 纯函数坐标计算，tooltip 通过 DOM 事件。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

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
  /** 面积图（折线图模式下） */
  area?: boolean
  /** 甜甜圈内径比例（饼图模式下），默认 0.5 */
  innerRadius?: number
}

export const Chart: Component<ChartProps> = (props, ctx) => {
  const { type = 'line', data, options = {}, title, area } = props
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.tooltip = null as { x: number; y: number; label: string; value: number } | null }

  const W = options.width ?? 320
  const H = options.height ?? 200
  const pad = options.padding ?? 32
  const cw = W - pad * 2
  const ch = H - pad * 2

  const values = data.map(d => d.value)
  const minVal = Math.min(0, ...values)
  const maxVal = Math.max(...values)
  const valRange = maxVal - minVal || 1

  // ── 渲染函数 ──────────────────────────────────────

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
      return h('circle', {
        key: `dot-${i}`,
        cx, cy, r: 3,
        fill: d.color ?? getDefaultColor(i),
        stroke: '#fff', 'stroke-width': 1.5,
        style: { cursor: 'pointer' },
        onMouseEnter: (e: Event) => {
          const r = (e.target as HTMLElement).getBoundingClientRect()
          $.tooltip = { x: r.left, y: r.top - 8, label: d.label, value: d.value }
        },
        onMouseLeave: () => { $.tooltip = null },
      })
    })

    return h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, [
      // 网格线 + Y 轴标签
      ...ticks.map((t, i) => h('g', { key: `tick-${i}` }, [
        h('line', {
          x1: pad, y1: t.y + pad, x2: W - pad, y2: t.y + pad,
          stroke: '#e5e7eb', 'stroke-width': 1,
        }),
        h('text', {
          x: pad - 6, y: t.y + pad + 4,
          'text-anchor': 'end', fill: '#6b7280',
          'font-size': '11', 'font-family': 'var(--wf-font-sans)',
        }, t.label),
      ])),
      // 面积
      ...(areaD ? [h('path', {
        key: 'area', d: areaD, fill: '#3b82f620', stroke: 'none',
        transform: `translate(${pad},${pad})`,
      })] : []),
      // 折线
      h('path', {
        key: 'line', d: lineD,
        fill: 'none', stroke: '#3b82f6', 'stroke-width': 2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        transform: `translate(${pad},${pad})`,
      }),
      // X 轴标签
      ...data.map((d, i) => {
        const x = xScale(i) + pad
        return h('text', {
          key: `xlabel-${i}`,
          x, y: H - pad + 14,
          'text-anchor': 'middle', fill: '#6b7280',
          'font-size': '10', 'font-family': 'var(--wf-font-sans)',
        }, d.label)
      }),
      // 数据点
      ...dots,
    ])
  }

  const renderBar = () => {
    const n = Math.max(1, data.length - 1)
    const xScale = scaleLinear([-0.5, n + 0.5], [0, cw])
    const yScale = scaleLinear([minVal, maxVal], [ch, 0])
    const ticks = getYTicks(yScale)
    const rects = barRects(data, xScale, yScale)

    return h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, [
      ...ticks.map((t, i) => h('g', { key: `tick-${i}` }, [
        h('line', {
          x1: pad, y1: t.y + pad, x2: W - pad, y2: t.y + pad,
          stroke: '#e5e7eb', 'stroke-width': 1,
        }),
        h('text', {
          x: pad - 6, y: t.y + pad + 4,
          'text-anchor': 'end', fill: '#6b7280',
          'font-size': '11', 'font-family': 'var(--wf-font-sans)',
        }, t.label),
      ])),
      ...rects.map((r, i) => h('rect', {
        key: `bar-${i}`,
        x: r.x + pad, y: r.y + pad, width: r.width, height: r.height,
        fill: r.color, rx: 2,
        onMouseEnter: (e: Event) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect()
          $.tooltip = { x: rect.left + rect.width / 2, y: rect.top - 8, label: r.label, value: r.value }
        },
        onMouseLeave: () => { $.tooltip = null },
      })),
      ...data.map((d, i) => {
        const x = xScale(i) + pad
        return h('text', {
          key: `xlabel-${i}`,
          x, y: H - pad + 14,
          'text-anchor': 'middle', fill: '#6b7280',
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

    return h('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, [
      ...arcs.map((a, i) => h('g', { key: `arc-${i}` }, [
        h('path', {
          d: a.d, fill: a.color, stroke: '#fff', 'stroke-width': 1.5,
          onMouseEnter: (e: Event) => {
            const r = (e.target as HTMLElement).getBoundingClientRect()
            $.tooltip = { x: r.left + r.width / 2, y: r.top - 8, label: a.label, value: a.value }
          },
          onMouseLeave: () => { $.tooltip = null },
        }),
        // 标签
        ...(a.value / data.reduce((s, d) => s + Math.abs(d.value), 0) > 0.05
          ? [h('text', {
            x: a.centroid.x, y: a.centroid.y + 3,
            'text-anchor': 'middle', fill: '#fff',
            'font-size': '11', 'font-weight': 'bold',
            'font-family': 'var(--wf-font-sans)',
          }, `${Math.round(a.value / data.reduce((s, d) => s + Math.abs(d.value), 0) * 100)}%`)]
          : []),
      ])),
    ])
  }

  // ── 主渲染 ────────────────────────────────────────

  let chartContent: any
  if (type === 'bar') chartContent = renderBar()
  else if (type === 'pie') chartContent = renderPie()
  else chartContent = renderLine()

  // 图例
  const legend = data.length > 1 ? h('div', { class: 'wf-chart-legend' },
    data.map((d, i) => h('span', { class: 'wf-chart-legend-item', key: `leg-${i}` }, [
      h('span', { class: 'wf-chart-legend-dot', style: { background: d.color ?? getDefaultColor(i) } }),
      h('span', { class: 'wf-chart-legend-label' }, d.label),
    ]))
  ) : null

  // Tooltip
  const tip = $.tooltip ? h('div', {
    class: 'wf-chart-tooltip',
    style: { left: $.tooltip.x, top: $.tooltip.y },
  }, [
    h('div', { class: 'wf-chart-tooltip-label' }, $.tooltip.label),
    h('div', { class: 'wf-chart-tooltip-value' }, String($.tooltip.value)),
  ]) : null

  return h('div', { class: 'wf-chart' }, [
    title ? h('div', { class: 'wf-chart-title' }, title) : null,
    chartContent,
    legend,
    tip,
  ].filter(Boolean))
}
