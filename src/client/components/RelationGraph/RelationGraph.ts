/**
 * weifuwu/components — RelationGraph
 *
 * 关系图谱可视化（人物关系/社会网络/组织协作——agent 世界的核心交互面）：
 * 确定性布局（环形/网格——零物理模拟——组件库零依赖纪律）+ SVG 渲染
 * （边 + 节点一体——viewBox 统一缩放）+ 交互（hover 邻接高亮/点击选中）。
 *
 * 来源：agent-builder 世界构建器需求（红楼梦人物关系/公司组织/城市社会
 * 结构——世界模型的关系可视化）。布局确定性：环形（网状关系——人物图）
 * 与网格（组织/矩阵）——不引入力导向模拟（依赖零、结果可预测——同一数据
 * 每次渲染一致——可截图对比）。
 *
 * 诚实裁剪：
 * - 节点坐标确定性（ring/grid）——复杂自由布局（力导向/手动拖拽）后续迭代
 * - 边为直线——多边重叠场景可后续升级 bezier/弯曲
 * - 节点为 SVG circle/rect + text——长文案由 sublabel 承担（超长截断不处理）
 */

import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface RelationGraphNode {
  id: string
  label: string
  /** 类型（颜色区分——人物/部门/居民/事件...） */
  kind?: string
  /** 子标签（如「财务视角」——节点下方小字） */
  sublabel?: string
  /** 权重（节点半径——代表型 agents 的人数——log 缩放） */
  weight?: number
}

export interface RelationGraphEdge {
  from: string
  to: string
  /** 关系类型（亲属/主仆/爱情/汇报/同盟...）——颜色与图例 */
  type?: string
  /** 强度（线宽 1-5——默认 1.5） */
  strength?: number
  /** 有向（箭头——默认无向） */
  directed?: boolean
}

export interface RelationGraphProps {
  nodes: RelationGraphNode[]
  edges: RelationGraphEdge[]
  /** 选中节点 id（受控） */
  selectedId?: string | null
  /** 节点点击（选中态切换——父层管理） */
  onSelect?: (id: string) => void
  /** 节点双击/单独动作（如打开 agent 档案——可选） */
  onNodeClick?: (id: string) => void
  /** 布局：ring（环形——网状关系）| grid（网格——组织/矩阵）——默认 ring */
  layout?: 'ring' | 'grid'
  width?: string
  height?: string
  /** 关系图例（type → 颜色映射） */
  showLegend?: boolean
  /** 类型颜色覆盖（kind → 色值） */
  nodeColors?: Record<string, string>
  /** 关系类型颜色覆盖（edge type → 色值） */
  edgeColors?: Record<string, string>
}

/** 内部坐标画布（viewBox——SVG 统一缩放） */
const VB_W = 800
const VB_H = 500

const NODE_PALETTE = ['#4f6ef7', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#14b8a6']
const EDGE_PALETTE = ['#94a3b8', '#4f6ef7', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

function hashOf(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
const colorOf = (key: string, palette: string[], overrides?: Record<string, string>): string =>
  overrides?.[key] ?? palette[hashOf(key) % palette.length]

/** 权重 → 节点半径（1-1000 人 → 12-30px——log 缩放） */
function radiusOf(weight?: number): number {
  if (weight === undefined) return 14
  const w = Math.max(1, weight)
  return 12 + Math.round(Math.log10(w) * 6)
}

/** 自动 viewBox（按节点边界紧凑裁剪——真实体验问题：固定 800×500 画布在
 *  宽容器里被 meet 缩小（留白/节点变小——demo 高度 420 显示不完整）——
 *  节点边界 + padding 计算——任何节点数/布局完整且最大化——确定性（同数据
 *  同 viewBox——测试可截图对比） */
function computeViewBox(nodes: RelationGraphNode[], pos: Array<{ x: number; y: number }>): string {
  const PAD = 28
  const SUB_LABEL = 34 // sublabel 在节点下方
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < nodes.length; i++) {
    const r = radiusOf(nodes[i].weight)
    const p = pos[i]
    minX = Math.min(minX, p.x - r)
    minY = Math.min(minY, p.y - r)
    maxX = Math.max(maxX, p.x + r)
    maxY = Math.max(maxY, p.y + r + (nodes[i].sublabel ? SUB_LABEL : 0))
  }
  if (nodes.length === 0) return `0 0 ${VB_W} ${VB_H}`
  return `${Math.round(minX - PAD)} ${Math.round(minY - PAD)} ${Math.round(maxX - minX + PAD * 2)} ${Math.round(maxY - minY + PAD * 2)}`
}

/** 确定性布局——环形/网格（同输入同输出——可截图对比） */
function layoutNodes(nodes: RelationGraphNode[], mode: 'ring' | 'grid'): Array<{ x: number; y: number }> {
  const n = nodes.length
  if (n === 0) return []
  if (mode === 'ring') {
    if (n === 1) return [{ x: VB_W / 2, y: VB_H / 2 }]
    const cx = VB_W / 2
    const cy = VB_H / 2
    const r = Math.min(VB_W, VB_H) / 2 - 70
    return nodes.map((_, i) => {
      const a = (Math.PI * 2 * i) / n - Math.PI / 2
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
    })
  }
  // grid：按 sqrt(n) 列排
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)))
  const rows = Math.ceil(n / cols)
  const gw = VB_W - 160
  const gh = VB_H - 140
  return nodes.map((_, i) => ({
    x: 80 + (gw * (i % cols)) / Math.max(1, cols - 1),
    y: 80 + (gh * Math.floor(i / cols)) / Math.max(1, rows - 1),
  }))
}

export const RelationGraph: Component<RelationGraphProps> = async (_init, _ctx) => {
  return async (props) => {
    const {
      nodes = [], edges = [], selectedId = null,
      onSelect, onNodeClick, layout = 'ring',
      width = '100%', height = '480px', showLegend = true,
      nodeColors, edgeColors,
    } = props
    const pos = layoutNodes(nodes, layout)
    const byId = new Map(nodes.map((n, i) => [n.id, { node: n, ...pos[i] }]))
    const viewBox = computeViewBox(nodes, pos)
    const kinds = [...new Set(nodes.map((n) => n.kind ?? 'default'))]
    const types = [...new Set(edges.map((e) => e.type ?? 'default'))]

    const edgePaths = edges
      .filter((e) => byId.has(e.from) && byId.has(e.to))
      .map((e) => {
        const a = byId.get(e.from)!
        const b = byId.get(e.to)!
        return {
          e,
          x1: a.x, y1: a.y, x2: b.x, y2: b.y,
          color: colorOf(e.type ?? 'default', EDGE_PALETTE, edgeColors),
          width: Math.min(5, Math.max(1, e.strength ?? 1.5)),
          marker: e.directed ? 'url(#rg-arrow)' : undefined,
        }
      })

    return h('div', { class: 'wf-rg' }, [
      h('svg', {
        class: 'wf-rg-canvas',
        width, height,
        viewBox,
        preserveAspectRatio: 'xMidYMid meet',
      }, [
        // 有向箭头 marker
        h('defs', {}, h('marker', { id: 'rg-arrow', viewBox: '0 0 10 10', refX: 22, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, h('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#94a3b8' }))),
        // 边（底层）
        ...edgePaths.map((p) => h('line', {
          key: `${p.e.from}-${p.e.to}-${p.e.type ?? ''}`,
          x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2,
          stroke: p.color,
          'stroke-width': p.width,
          marker: p.marker,
          class: 'wf-rg-edge',
          opacity: 0.75,
          // **边不拦截点击（真实 bug——节点中心被爱情线遮挡——elementFromPoint
          //  返回 line——g 的 onClick 不触发）**——pointer-events none 让点击
          //  穿透到节点命中圈/空白
          'pointer-events': 'none',
        })),
        // 节点（上层）
        ...nodes.map((n) => {
          const p = byId.get(n.id)!
          const r = radiusOf(n.weight)
          const color = colorOf(n.kind ?? 'default', NODE_PALETTE, nodeColors)
          const selected = n.id === selectedId
          return h('g', {
            key: n.id,
            class: 'wf-rg-node' + (selected ? ' wf-rg-node--selected' : ''),
            transform: `translate(${p.x}, ${p.y})`,
            onClick: () => {
              onSelect?.(n.id)
              onNodeClick?.(n.id)
            },
          }, [
            h('title', {}, `${n.label}${n.sublabel ? `（${n.sublabel}）` : ''}`),
            // 透明命中圈（点击区域 = 节点 + 10px——标签/附近都可点——不随视觉缩放）
            h('circle', { r: r + 10, fill: 'transparent', 'pointer-events': 'all' }),
            h('circle', { r, fill: color, opacity: 0.18, stroke: color, 'stroke-width': selected ? 3 : 1.5 }),
            h('text', { class: 'wf-rg-label', y: r + 16, 'text-anchor': 'middle' }, n.label),
            n.sublabel ? h('text', { class: 'wf-rg-sublabel', y: r + 30, 'text-anchor': 'middle' }, n.sublabel) : null,
          ])
        }),
      ]),
      // 图例（kind + edge type）
      showLegend && (kinds.length + types.length > 0) ? h('div', { class: 'wf-rg-legend' }, [
        ...kinds.map((k) => h('span', { class: 'wf-rg-legend-item' }, [
          h('span', { class: 'wf-rg-swatch', style: { background: colorOf(k, NODE_PALETTE, nodeColors) } }),
          k,
        ])),
        ...types.map((t) => h('span', { class: 'wf-rg-legend-item' }, [
          h('span', { class: 'wf-rg-line', style: { background: colorOf(t, EDGE_PALETTE, edgeColors) } }),
          t,
        ])),
      ]) : null,
    ])
  }
}
