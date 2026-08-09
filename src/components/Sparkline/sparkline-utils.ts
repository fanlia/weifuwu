export interface SparklinePoint {
  x: number
  y: number
}

/**
 * 将数据点归一化到 [padding, width-padding] × [padding, height-padding]。
 * - min → 底部（y=height-padding），max → 顶部（y=padding）
 * - 单点：居中（x 中点，y 垂直居中）
 * - 等值：全部垂直居中（除零防护）
 * - 空：空数组
 */
export function computeSparklinePoints(
  data: number[],
  width: number,
  height: number,
  padding = 2,
): SparklinePoint[] {
  const n = data.length
  if (n === 0) return []
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  if (n === 1) {
    return [{ x: width / 2, y: height / 2 }]
  }
  return data.map((v, i) => ({
    x: padding + (n === 1 ? 0 : (i / (n - 1)) * innerW),
    y: range === 0 ? height / 2 : padding + (1 - (v - min) / range) * innerH,
  }))
}

/** 折线 points 字符串 */
export function polylinePoints(pts: SparklinePoint[]): string {
  return pts.map(p => `${Math.round(p.x * 10) / 10},${Math.round(p.y * 10) / 10}`).join(' ')
}

/** 平滑 path（Catmull-Rom → cubic Bézier）——描边 + 可选面积 */
export function smoothPath(pts: SparklinePoint[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`
  let d = `M ${pts[0].x},${pts[0].y}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`
  }
  return d
}
