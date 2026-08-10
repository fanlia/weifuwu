import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Chart } from './Chart.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }), ready: false } } as any
}

/** 两阶段组件：mount 后调用 renderFn(props) */
function renderrenderVNode(Chart, props: any, ctx: WfuiContext) {
  const result = renderVNode(Chart, props, ctx)
  if (typeof result === 'function') return result(props)
  return result
}

const data = [
  { label: 'A', value: 10 },
  { label: 'B', value: 20 },
  { label: 'C', value: 15 },
]

describe('Chart', () => {
  it('renders SVG for line chart', () => {
    const vnode = renderrenderVNode(Chart, { type: 'line', data }, mockCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    assert.ok(svg, 'should render svg')
    assert.equal(svg?.props?.style?.width, '100%')
    assert.equal(svg?.props?.height, 200)
  })

  it('renders SVG for bar chart', () => {
    const vnode = renderrenderVNode(Chart, { type: 'bar', data }, mockCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    assert.ok(svg, 'should render svg')
  })

  it('renders SVG for pie chart', () => {
    const vnode = renderrenderVNode(Chart, { type: 'pie', data }, mockCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    assert.ok(svg, 'should render svg')
  })

  it('renders title when provided', () => {
    const vnode = renderrenderVNode(Chart, { type: 'line', data, title: '月收入' }, mockCtx())!
    const title = vnode.props.children.find((c: any) => c?.props?.class === 'wf-chart-title')
    assert.ok(title, 'should render title')
    assert.equal(title?.props?.children, '月收入')
  })

  it('renders legend when data has multiple items', () => {
    const vnode = renderrenderVNode(Chart, { type: 'line', data }, mockCtx())!
    const legend = vnode.props.children.find((c: any) => c?.props?.class === 'wf-chart-legend')
    assert.ok(legend, 'should render legend')
    assert.equal(legend?.props?.children?.length, 3)
  })

  it('renders default options when none provided', () => {
    const vnode = renderrenderVNode(Chart, { type: 'line', data }, mockCtx())!
    assert.ok(vnode, 'should render without options')
  })

  it('defaults to line chart', () => {
    const vnode = renderrenderVNode(Chart, { data }, mockCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    assert.ok(svg, 'default should be line chart with svg')
  })

  it('has path elements for line chart', () => {
    const vnode = renderrenderVNode(Chart, { type: 'line', data }, mockCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    const paths = svg?.props?.children?.filter((c: any) => c?.type === 'path')
    assert.ok(paths?.length > 0, 'line chart should have path elements')
  })

  it('has rect elements for bar chart', () => {
    const vnode = renderrenderVNode(Chart, { type: 'bar', data }, mockCtx())!
    const svg = vnode.props.children.find((c: any) => c?.type === 'svg')
    const rects = svg?.props?.children?.filter((c: any) => c?.type === 'rect')
    assert.ok(rects?.length > 0, 'bar chart should have rect elements')
  })

  it('handles empty data gracefully', () => {
    const vnode = renderrenderVNode(Chart, { type: 'line', data: [] }, mockCtx())!
    assert.ok(vnode, 'should render with empty data')
  })
})
