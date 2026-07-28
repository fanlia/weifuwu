/**
 * weifuwu/components — Chart 纯函数坐标计算
 *
 * 无 DOM 依赖，可测试。
 */

export type ChartType = 'line' | 'bar' | 'pie' | 'donut'

export interface DataPoint {
  label: string
  value: number
  color?: string
}

export interface ChartOptions {
  width?: number
  height?: number
  padding?: number
}

// ── 线性比例尺 ──────────────────────────────────────

export interface ScaleLinear {
  (v: number): number
  invert?(v: number): number
  domain: [number, number]
  range: [number, number]
}

export function scaleLinear(domain: [number, number], range: [number, number]): ScaleLinear {
  const fn = ((v: number) => {
    const t = (v - domain[0]) / (domain[1] - domain[0])
    return range[0] + t * (range[1] - range[0])
  }) as ScaleLinear
  fn.domain = domain
  fn.range = range
  fn.invert = (v: number) => {
    const t = (v - range[0]) / (range[1] - range[0])
    return domain[0] + t * (domain[1] - domain[0])
  }
  return fn
}

// ── 折线路径 ────────────────────────────────────────

export function linePath(data: DataPoint[], xScale: ScaleLinear, yScale: ScaleLinear): string {
  if (data.length === 0) return ''
  return data.map((d, i) => {
    const x = xScale(i)
    const y = yScale(d.value)
    return i === 0 ? `M${x},${y}` : `L${x},${y}`
  }).join(' ')
}

// ── 面积路径 ────────────────────────────────────────

export function areaPath(data: DataPoint[], xScale: ScaleLinear, yScale: ScaleLinear, yBase: number): string {
  if (data.length === 0) return ''
  const pts = data.map((d, i) => {
    const x = xScale(i)
    const y = yScale(d.value)
    return `${x},${y}`
  })
  const firstX = xScale(0)
  const lastX = xScale(data.length - 1)
  return `M${firstX},${yBase}L${pts.join('L')}L${lastX},${yBase}Z`
}

// ── 柱状图矩形 ──────────────────────────────────────

export interface BarRect {
  x: number
  y: number
  width: number
  height: number
  color: string
  label: string
  value: number
}

export function barRects(data: DataPoint[], xScale: ScaleLinear, yScale: ScaleLinear, barWidth?: number): BarRect[] {
  const bw = barWidth ?? Math.max(4, (xScale.range[1] - xScale.range[0]) / data.length * 0.6)
  return data.map((d, i) => ({
    x: xScale(i) - bw / 2,
    y: yScale(Math.max(0, d.value)),
    width: bw,
    height: Math.abs(yScale(d.value) - yScale(0)),
    color: d.color ?? getDefaultColor(i),
    label: d.label,
    value: d.value,
  }))
}

// ── 饼图弧线 ────────────────────────────────────────

export interface Arc {
  d: string
  color: string
  label: string
  value: number
  centroid: { x: number; y: number }
}

export function pieArcs(data: DataPoint[], cx: number, cy: number, radius: number): Arc[] {
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0)
  if (total === 0) return []
  let startAngle = -Math.PI / 2
  return data.map((d, i) => {
    const angle = (Math.abs(d.value) / total) * Math.PI * 2
    const endAngle = startAngle + angle
    const arc = createArc(cx, cy, radius, startAngle, endAngle)
    const midAngle = startAngle + angle / 2
    startAngle = endAngle
    return {
      d: arc,
      color: d.color ?? getDefaultColor(i),
      label: d.label,
      value: d.value,
      centroid: {
        x: cx + Math.cos(midAngle) * radius * 0.6,
        y: cy + Math.sin(midAngle) * radius * 0.6,
      },
    }
  })
}

export function donutArcs(data: DataPoint[], cx: number, cy: number, radius: number, innerRadius: number): Arc[] {
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0)
  if (total === 0) return []
  let startAngle = -Math.PI / 2
  return data.map((d, i) => {
    const angle = (Math.abs(d.value) / total) * Math.PI * 2
    const endAngle = startAngle + angle
    const arc = createDonutArc(cx, cy, radius, innerRadius, startAngle, endAngle)
    const midAngle = startAngle + angle / 2
    startAngle = endAngle
    return {
      d: arc,
      color: d.color ?? getDefaultColor(i),
      label: d.label,
      value: d.value,
      centroid: {
        x: cx + Math.cos(midAngle) * (radius + innerRadius) / 2 * 0.9,
        y: cy + Math.sin(midAngle) * (radius + innerRadius) / 2 * 0.9,
      },
    }
  })
}

// ── SVG 弧线路径 ────────────────────────────────────

function createArc(cx: number, cy: number, r: number, start: number, end: number): string {
  const x1 = cx + r * Math.cos(start)
  const y1 = cy + r * Math.sin(start)
  const x2 = cx + r * Math.cos(end)
  const y2 = cy + r * Math.sin(end)
  const large = end - start > Math.PI ? 1 : 0
  return `M${cx},${cy}L${x1},${y1}A${r},${r} 0 ${large} 1 ${x2},${y2}Z`
}

function createDonutArc(cx: number, cy: number, r: number, ir: number, start: number, end: number): string {
  const x1 = cx + r * Math.cos(start)
  const y1 = cy + r * Math.sin(start)
  const x2 = cx + r * Math.cos(end)
  const y2 = cy + r * Math.sin(end)
  const ix1 = cx + ir * Math.cos(end)
  const iy1 = cy + ir * Math.sin(end)
  const ix2 = cx + ir * Math.cos(start)
  const iy2 = cy + ir * Math.sin(start)
  const large = end - start > Math.PI ? 1 : 0
  return `M${x1},${y1}A${r},${r} 0 ${large} 1 ${x2},${y2}L${ix1},${iy1}A${ir},${ir} 0 ${large} 0 ${ix2},${iy2}Z`
}

// ── 默认色板 ────────────────────────────────────────

const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export function getDefaultColor(index: number): string {
  return COLORS[index % COLORS.length]
}

// ── Y 轴刻度 ────────────────────────────────────────

export interface Tick {
  value: number
  y: number
  label: string
}

export function getYTicks(yScale: ScaleLinear, tickCount = 5): Tick[] {
  const [d0, d1] = yScale.domain
  const step = (d1 - d0) / tickCount
  const ticks: Tick[] = []
  for (let i = 0; i <= tickCount; i++) {
    const v = d0 + step * i
    ticks.push({ value: v, y: yScale(v), label: formatTick(v) })
  }
  return ticks
}

function formatTick(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'k'
  return String(Math.round(v))
}
