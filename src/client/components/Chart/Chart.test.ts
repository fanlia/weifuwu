import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Chart } from './Chart.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */

// 官方 createTestCtx（testing.ts——usePopup 标准 mock——§7.2 纪律）


/** 两阶段组件：mount 后调用 await renderFn(props) */
async function renderrenderVNode(Chart, props: any, ctx: UIContext) {
  const result = await renderVNode(Chart, props, ctx)
  if (typeof result === 'function') return result(props)
  return result
}

const data = [
  { label: 'A', value: 10 },
  { label: 'B', value: 20 },
  { label: 'C', value: 15 },
]

describe('Chart', () => {
  it('renders SVG for line chart', async () => {
    const vnode = await renderrenderVNode(Chart, { type: 'line', data }, createTestCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    assert.ok(svg, 'should render svg')
    assert.equal(svg?.props?.style?.width, '100%')
    assert.equal(svg?.props?.height, 200)
  })

  it('renders SVG for bar chart', async () => {
    const vnode = await renderrenderVNode(Chart, { type: 'bar', data }, createTestCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    assert.ok(svg, 'should render svg')
  })

  it('renders SVG for pie chart', async () => {
    const vnode = await renderrenderVNode(Chart, { type: 'pie', data }, createTestCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    assert.ok(svg, 'should render svg')
  })

  it('renders title when provided', async () => {
    const vnode = await renderrenderVNode(Chart, { type: 'line', data, title: '月收入' }, createTestCtx())!
    const title = vnode.props.children.find((c: any) => c?.props?.class === 'wf-chart-title')
    assert.ok(title, 'should render title')
    assert.equal(title?.props?.children, '月收入')
  })

  it('renders legend when data has multiple items', async () => {
    const vnode = await renderrenderVNode(Chart, { type: 'line', data }, createTestCtx())!
    const legend = vnode.props.children.find((c: any) => c?.props?.class === 'wf-chart-legend')
    assert.ok(legend, 'should render legend')
    assert.equal(legend?.props?.children?.length, 3)
  })

  it('renders default options when none provided', async () => {
    const vnode = await renderrenderVNode(Chart, { type: 'line', data }, createTestCtx())!
    assert.ok(vnode, 'should render without options')
  })

  it('defaults to line chart', async () => {
    const vnode = await renderrenderVNode(Chart, { data }, createTestCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    assert.ok(svg, 'default should be line chart with svg')
  })

  it('has path elements for line chart', async () => {
    const vnode = await renderrenderVNode(Chart, { type: 'line', data }, createTestCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    const paths = svg?.props?.children?.filter((c: any) => c?.type === 'path')
    assert.ok(paths?.length > 0, 'line chart should have path elements')
  })

  it('has rect elements for bar chart', async () => {
    const vnode = await renderrenderVNode(Chart, { type: 'bar', data }, createTestCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    const rects = svg?.props?.children?.filter((c: any) => c?.type === 'rect')
    assert.ok(rects?.length > 0, 'bar chart should have rect elements')
  })

  it('handles empty data gracefully', async () => {
    const vnode = await renderrenderVNode(Chart, { type: 'line', data: [] }, createTestCtx())!
    assert.ok(vnode, 'should render with empty data')
  })
})

it('Chart：radar/gauge/scatter 类型渲染（SVG 输出）', async () => {
  const { renderVNode, createTestCtx, findByClass } = await import('../../vdom/testing.ts')
  const ctx = createTestCtx()
  const data = [{ label: 'A', value: 3 }, { label: 'B', value: 5 }]
  const radar: any = await renderVNode(Chart, { type: 'radar', data }, ctx)
  assert.ok(findByClass(radar, 'wf-chart-svg').length > 0, 'radar SVG 渲染')
  const gauge: any = await renderVNode(Chart, { type: 'gauge', data: [{ label: '进度', value: 75 }], options: { min: 0, max: 100 } }, ctx)
  assert.ok(findByClass(gauge, 'wf-chart-svg').length > 0, 'gauge SVG 渲染')
  const scatter: any = await renderVNode(Chart, { type: 'scatter', data }, ctx)
  assert.ok(findByClass(scatter, 'wf-chart-svg').length > 0, 'scatter SVG 渲染')
})
