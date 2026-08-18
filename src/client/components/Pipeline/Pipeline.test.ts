import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeLayers, layoutGraph, detectCycle } from './dag-utils.ts'
import { Pipeline } from './Pipeline.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'


describe('computeLayers — 层级分配', () => {
  test('线性链：逐层递增', async () => {
    const layers = computeLayers(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }],
    )
    assert.equal(layers.get('a'), 0)
    assert.equal(layers.get('b'), 1)
    assert.equal(layers.get('c'), 2)
  })

  test('菱形依赖：b/c 同层（最长路径）', async () => {
    const layers = computeLayers(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      [{ from: 'a', to: 'b' }, { from: 'a', to: 'c' }, { from: 'b', to: 'd' }, { from: 'c', to: 'd' }],
    )
    assert.equal(layers.get('a'), 0)
    assert.equal(layers.get('b'), 1)
    assert.equal(layers.get('c'), 1)
    assert.equal(layers.get('d'), 2)
  })

  test('无依赖节点独立成层（0）', async () => {
    const layers = computeLayers(
      [{ id: 'a' }, { id: 'x' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }],
    )
    assert.equal(layers.get('x'), 0)
  })

  test('分层结果覆盖所有节点', async () => {
    const layers = computeLayers(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ from: 'a', to: 'b' }],
    )
    assert.equal(layers.size, 3)
  })
})

describe('detectCycle — 环检测', () => {
  test('无环 → false', async () => {
    assert.equal(detectCycle(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }],
    ), false)
  })

  test('自环 → true', async () => {
    assert.equal(detectCycle(
      [{ id: 'a' }],
      [{ from: 'a', to: 'a' }],
    ), true)
  })

  test('多节点环 → true', async () => {
    assert.equal(detectCycle(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }],
    ), true)
  })
})

describe('layoutGraph — 坐标布局', () => {
  test('垂直布局：节点分布 + 边路径', async () => {
    const { nodes, edges } = layoutGraph(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }],
      { orientation: 'vertical', width: 240, height: 160 },
    )
    assert.equal(nodes.length, 2)
    assert.equal(edges.length, 1)
    // a 在 b 上方
    assert.ok(nodes[0].y < nodes[1].y)
    assert.match(edges[0].d, /^M/, '边是 path')
  })

  test('水平布局：a 在 b 左侧', async () => {
    const { nodes, edges } = layoutGraph(
      [{ id: 'a' }, { id: 'b' }],
      [{ from: 'a', to: 'b' }],
      { orientation: 'horizontal', width: 240, height: 160 },
    )
    assert.ok(nodes[0].x < nodes[1].x)
    assert.equal(edges.length, 1)
  })
})

describe('Pipeline 组件', () => {
  test('渲染节点 + 连线 + 状态色', async () => {
    const vnode = await renderVNode(
      Pipeline,
      {
        nodes: [
          { id: 'n1', label: '输入', status: 'success' },
          { id: 'n2', label: '处理', status: 'running' },
        ],
        edges: [{ from: 'n1', to: 'n2' }],
      },
      createTestCtx(),
    )
    assert.equal(vnode.props.class, 'wf-pipeline')
    const str = JSON.stringify(vnode)
    assert.match(str, /wf-pipeline-node/, '有节点')
    assert.match(str, /wf-pipeline-edge/, '有连线')
    assert.match(str, /wf-pipeline-node--success/, 'success 状态类')
    assert.match(str, /wf-pipeline-node--running/, 'running 状态类')
  })

  test('环检测：有环 → 渲染警告不崩溃', async () => {
    const vnode = await renderVNode(
      Pipeline,
      {
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
      },
      createTestCtx(),
    )
    assert.ok(vnode, '不崩溃')
  })

  test('节点标签渲染', async () => {
    const vnode = await renderVNode(
      Pipeline,
      {
        nodes: [{ id: 'n1', label: 'Agent 调度' }],
        edges: [],
      },
      createTestCtx(),
    )
    assert.match(JSON.stringify(vnode), /Agent 调度/)
  })
})
