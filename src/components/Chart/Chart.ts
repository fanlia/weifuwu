/**
 * weifuwu/components — Chart
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createPortal, h } from '../../ui-dom/vnode.ts'

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
  let tooltipPanel: HTMLElement | null = null
  let prevOpen = false

  // §5.1 ref 纪律：稳定引用定义在 mount 作用域（内联 ref 每渲染新函数 → 反复触发）
  const panelRef = (el: HTMLElement | null) => { tooltipPanel = el }

  // 滚动/resize 时自动重算坐标（tooltip 跟随触发元素）；panel 传入 → 视口夹紧
  // （getBoundingClientRect 含 translate(-50%,-100%) 变换，clamp 位移同步逻辑成立）
  const pos = ctx.ui.usePopupPosition({
    el: () => tooltipEl as HTMLElement | null,
    isOpen: () => tooltip !== null,
    panel: () => tooltipPanel,
    compute: (r) => ({ top: r.top - 8, left: r.left + r.width / 2 }),
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
          ctx.ui.render()
        }
        const leave = () => { tooltipEl = null; tooltip = null; ctx.ui.render() }
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
            tooltip = { label: r.label, value: r.value, color: r.color }; ctx.ui.render()
          },
          onMouseLeave: () => { tooltipEl = null; tooltip = null; ctx.ui.render() },
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
              tooltip = { label: a.label, value: a.value, color: a.color }; ctx.ui.render()
            },
            onMouseLeave: () => { tooltipEl = null; tooltip = null; ctx.ui.render() },
          }),
          ...(a.value / data.reduce((s, d) => s + Math.abs(d.value), 0) > 0.05
            ? [h('text', {
              x: a.centroid.x, y: a.centroid.y + 3,
              'text-anchor': 'middle', style: { fill: 'var(--wf-color-on-brand)' },
              'font-size': '11', 'font-weight': 'bold',
              'font-family': 'var(--wf-font-sans)',
            }, `${Math.round(a.value / data.reduce((s, d) => s + Math.abs(d.value), 0) * 100)}%`)]
            : []),
        ])),
      ])
    }

    let chartContent: any
    if (type === 'bar') chartContent = renderBar()
    else if (type === 'pie') chartContent = renderPie()
    else chartContent = renderLine()

    const legend = data.length > 1 ? h('div', { class: 'wf-chart-legend' },
      data.map((d, i) => h('span', { class: 'wf-chart-legend-item', key: `leg-${i}` }, [
        h('span', { class: 'wf-chart-legend-dot', style: { background: d.color ?? getDefaultColor(i) } }),
        h('span', { class: 'wf-chart-legend-label' }, d.label),
      ]))
    ) : null

    // ── 打开瞬间算一次初始坐标 ──
    const isTipOpen = tooltip !== null
    if (isTipOpen && !prevOpen) pos.refresh()
    prevOpen = isTipOpen

    const tip = tooltip ? createPortal(h('div', {
      class: 'wf-chart-tooltip',
      ref: panelRef,
      style: { position: 'fixed', left: pos.left, top: pos.top },
    }, [
      h('div', { class: 'wf-chart-tooltip-label' }, [
        tooltip.color ? h('span', { class: 'wf-chart-tooltip-dot', style: { background: tooltip.color } }) : null,
        h('span', {}, tooltip.label),
      ]),
      h('div', { class: 'wf-chart-tooltip-value' }, String(tooltip.value)),
    ]), 'chart-tooltip') : null

    return h('div', {
      class: `wf-chart${className ? ' ' + className : ''}`,
      role: 'img',
      'aria-label': title ?? (ctx as any)?.i18n?.components?.Chart?.ariaLabel ?? '图表',
    }, [
      title ? h('div', { class: 'wf-chart-title' }, title) : null,
      chartContent,
      legend,
      tip,
    ].filter(Boolean))
  }
}
