import type { Component } from '../../ui-dom/vnode.ts'
import { h } from '../../ui-dom/vnode.ts'
import { computeSparklinePoints, polylinePoints, smoothPath } from './sparkline-utils.ts'

export interface SparklineProps {
  /** 数据序列 */
  data: number[]
  /** SVG 宽（默认 120） */
  width?: number
  /** SVG 高（默认 32） */
  height?: number
  /** 描边色（默认语义 primary，随 currentColor 可继承） */
  stroke?: string
  /** 面积填充（默认关） */
  fill?: boolean
  /** 平滑曲线（Catmull-Rom）——默认折线 */
  smooth?: boolean
  /** 可访问名（提供则 role=img + aria-label，否则 aria-hidden 装饰） */
  label?: string
  className?: string
}

/**
 * Sparkline — 迷你趋势线（SVG 自绘，零依赖）。
 * 归一化到 viewBox，等值/单点/空数据安全。
 */
export const Sparkline: Component<SparklineProps> = async (_init, ctx) =>
  (props) => {
    const {
      data,
      width = 120,
      height = 32,
      stroke = 'currentColor',
      fill = false,
      smooth = false,
      label,
      className = '',
    } = props

    const pts = computeSparklinePoints(data, width, height, 2)
    const kids: any[] = []

    if (pts.length > 0) {
      if (smooth) {
        const d = smoothPath(pts)
        if (fill) {
          kids.push(h('path', {
            d: `${d} L ${pts[pts.length - 1].x},${height} L ${pts[0].x},${height} Z`,
            fill: stroke,
            opacity: 0.12,
          }))
        }
        kids.push(h('path', { d, fill: 'none', stroke, 'stroke-width': 1.5, 'stroke-linecap': 'round' }))
      } else {
        const points = polylinePoints(pts)
        if (fill) {
          kids.push(h('polygon', {
            points: `${points} ${width - 2},${height} 2,${height}`,
            fill: stroke,
            opacity: 0.12,
          }))
        }
        kids.push(h('polyline', { points, fill: 'none', stroke, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
      }
    }

    return h('svg', {
      class: `wf-sparkline${className ? ` ${className}` : ''}`,
      viewBox: `0 0 ${width} ${height}`,
      width,
      height,
      role: label ? 'img' : undefined,
      'aria-label': label,
      'aria-hidden': label ? undefined : true,
    }, kids)
  }
