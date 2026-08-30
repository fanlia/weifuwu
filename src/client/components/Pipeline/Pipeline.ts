import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { layoutGraph, detectCycle } from './dag-utils.ts'

export type NodeStatus = 'default' | 'success' | 'running' | 'error' | 'pending'

export interface PipelineNode {
  id: string
  label: string
  /** 状态着色（默认 default） */
  status?: NodeStatus
}

export interface PipelineEdge {
  from: string
  to: string
}

export interface PipelineProps {
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  /** 布局方向（默认 vertical：输入在左→输出在右） */
  orientation?: 'vertical' | 'horizontal'
  width?: number
  height?: number
  className?: string
}

/**
 * Pipeline/DAG — Agent 多步工作流可视化。
 * 分层布局（Kahn 拓扑最长路径）+ SVG 贝塞尔连线 + 状态语义色。
 * 纯函数布局（dag-utils）可 SSR/单测；环检测 → 渲染警告不崩溃。
 */
export const Pipeline: Component<PipelineProps> = (_init, ctx) =>
  (props) => {
    const {
      nodes,
      edges,
      orientation = 'vertical',
      width = 360,
      height = 220,
      className = '',
    } = props

    const hasCycle = detectCycle(nodes, edges)
    const { nodes: laid, edges: laidEdges } = layoutGraph(nodes, edges, {
      orientation,
      width,
      height,
    })

    const nodeEls = laid.map(n => {
      const node = nodes.find(x => x.id === n.id)
      const status = node?.status ?? 'default'
      return h('div', {
        class: `wf-pipeline-node wf-pipeline-node--${status}`,
        key: n.id, // 节点身份（节点增删/拓扑变化——keyed diff move 不重建）
        style: { left: `${Math.round(n.x)}px`, top: `${Math.round(n.y)}px` },
        'data-id': n.id,
      }, node?.label ?? n.id)
    })

    const edgeEls = laidEdges.map((e, i) =>
      h('path', {
        class: 'wf-pipeline-edge',
        d: e.d,
        key: `e${i}`,
      }),
    )

    return h('div', { class: `wf-pipeline${className ? ` ${className}` : ''}` }, [
      h('svg', {
        class: 'wf-pipeline-svg',
        width,
        height,
        viewBox: `0 0 ${width} ${height}`,
        'aria-hidden': true,
      }, edgeEls),
      h('div', { class: 'wf-pipeline-nodes' }, nodeEls),
      hasCycle && h('div', { class: 'wf-pipeline-warn' }, '检测到环依赖——布局可能不准确'),
    ].filter(Boolean))
  }
