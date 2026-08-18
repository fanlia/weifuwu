export interface DagNodeInput {
  id: string
}

export interface DagEdgeInput {
  from: string
  to: string
}

export interface LayoutNode {
  id: string
  x: number
  y: number
}

export interface LayoutEdge {
  from: string
  to: string
  d: string
}

/**
 * 分层：每个节点层 = 最长入链深度（BFS/DP）。
 * 无入边节点 → 0；菱形依赖取最长路径。
 */
export function computeLayers(nodes: DagNodeInput[], edges: DagEdgeInput[]): Map<string, number> {
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const n of nodes) {
    adj.set(n.id, [])
    indeg.set(n.id, 0)
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  // Kahn 拓扑 + 层推进（同层取最长）
  const layer = new Map<string, number>()
  const queue: string[] = []
  for (const n of nodes) {
    if ((indeg.get(n.id) ?? 0) === 0) {
      queue.push(n.id)
      layer.set(n.id, 0)
    }
  }
  let visited = 0
  while (queue.length > 0) {
    const cur = queue.shift()!
    visited++
    const curLayer = layer.get(cur) ?? 0
    for (const next of adj.get(cur) ?? []) {
      // 下一节点层 ≥ 当前层+1（多前驱取最大）
      layer.set(next, Math.max(layer.get(next) ?? 0, curLayer + 1))
      indeg.set(next, (indeg.get(next) ?? 1) - 1)
      if ((indeg.get(next) ?? 0) === 0) queue.push(next)
    }
  }
  // 有环：未访问节点放最后层
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, visited)
  }
  return layer
}

/** 环检测：Kahn 拓扑——有环时访问节点数 < 总节点数 */
export function detectCycle(nodes: DagNodeInput[], edges: DagEdgeInput[]): boolean {
  const adj = new Map<string, string[]>()
  const indeg = new Map<string, number>()
  for (const n of nodes) {
    adj.set(n.id, [])
    indeg.set(n.id, 0)
  }
  for (const e of edges) {
    adj.get(e.from)?.push(e.to)
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
  }
  const queue: string[] = nodes.filter(n => (indeg.get(n.id) ?? 0) === 0).map(n => n.id)
  let visited = 0
  while (queue.length > 0) {
    const cur = queue.shift()!
    visited++
    for (const next of adj.get(cur) ?? []) {
      indeg.set(next, (indeg.get(next) ?? 1) - 1)
      if ((indeg.get(next) ?? 0) === 0) queue.push(next)
    }
  }
  return visited < nodes.length
}

export interface GraphLayoutOptions {
  orientation: 'vertical' | 'horizontal'
  width: number
  height: number
  nodeW?: number
  nodeH?: number
}

/** 布局：分层 → 层列分布 + 层内均匀；边 = 贝塞尔 path */
export function layoutGraph(
  nodes: DagNodeInput[],
  edges: DagEdgeInput[],
  opts: GraphLayoutOptions,
): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const { orientation, width, height, nodeW = 88, nodeH = 40 } = opts
  const layer = computeLayers(nodes, edges)

  // 按层分组
  const byLayer = new Map<number, string[]>()
  for (const n of nodes) {
    const l = layer.get(n.id) ?? 0
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l)!.push(n.id)
  }
  const layerCount = byLayer.size

  const pos = new Map<string, { x: number; y: number }>()
  for (const [l, ids] of byLayer) {
    const count = ids.length
    ids.forEach((id, i) => {
      if (orientation === 'vertical') {
        // 垂直：上下流动——y 方向 = 层，x 方向 = 层内
        const y = l === 0 ? nodeH / 2 : l === layerCount - 1 ? height - nodeH / 2 : (l / (layerCount - 1)) * height
        const x = count === 1 ? width / 2 : (i / (count - 1)) * (width - nodeW) + nodeW / 2
        pos.set(id, { x, y })
      } else {
        // 水平：左右流动——x 方向 = 层，y 方向 = 层内
        const x = l === 0 ? nodeW / 2 : l === layerCount - 1 ? width - nodeW / 2 : (l / (layerCount - 1)) * width
        const y = count === 1 ? height / 2 : (i / (count - 1)) * (height - nodeH) + nodeH / 2
        pos.set(id, { x, y })
      }
    })
  }

  const outNodes: LayoutNode[] = nodes.map(n => {
    const p = pos.get(n.id) ?? { x: width / 2, y: height / 2 }
    return { id: n.id, x: p.x, y: p.y }
  })

  const outEdges: LayoutEdge[] = edges.map(e => {
    const a = pos.get(e.from) ?? { x: 0, y: 0 }
    const b = pos.get(e.to) ?? { x: 0, y: 0 }
    // 贝塞尔：垂直布局控制点在 y 方向（上下流动），水平在 x 方向
    const ctrl = orientation === 'vertical'
      ? `C ${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}`
      : `C ${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`
    return { from: e.from, to: e.to, d: `M ${a.x},${a.y} ${ctrl}` }
  })

  return { nodes: outNodes, edges: outEdges }
}
