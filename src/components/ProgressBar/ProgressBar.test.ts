import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ProgressBar } from './ProgressBar.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('ProgressBar', () => {
  it('renders progress bar', () => {
    const vnode = renderVNode(ProgressBar, {}, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-progress/)
  })

  it('sets width based on value', () => {
    const vnode = renderVNode(ProgressBar, { value: 50 }, mockCtx())!
    const fill = vnode.props.children[0]
    assert.equal(fill.props.style.width, '50%')
  })

  it('clamps value to 0-100', () => {
    const over = renderVNode(ProgressBar, { value: 200 }, mockCtx())!
    const under = renderVNode(ProgressBar, { value: -10 }, mockCtx())!
    assert.equal(over.props.children[0].props.style.width, '100%')
    assert.equal(under.props.children[0].props.style.width, '0%')
  })

  it('renders label when provided', () => {
    const vnode = renderVNode(ProgressBar, { label: '进度', value: 50 }, mockCtx())!
    assert.equal(vnode.props.class, 'wf-progress-wrap')
    assert.equal(vnode.props.children[0].props.children, '进度')
  })

  it('renders value percentage when showValue is true', () => {
    const vnode = renderVNode(ProgressBar, { value: 75, showValue: true }, mockCtx())!
    assert.equal(vnode.props.class, 'wf-progress-wrap')
    const valueEl = vnode.props.children[vnode.props.children.length - 1]
    assert.equal(valueEl.props.children, '75%')
  })
})

it('indeterminate：value 缺省 → 不确定态动画类 + 无 valuenow', () => {
  const vnode = renderVNode(ProgressBar, { label: '加载中' }, mockCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-progress--indeterminate'), '不确定态类')
  assert.ok(!s.includes('aria-valuenow'), '无 valuenow（不确定）')
})

it('status 变色 + size', () => {
  const v1 = renderVNode(ProgressBar, { value: 100, status: 'success' }, mockCtx())!
  assert.ok(JSON.stringify(v1).includes('wf-progress-fill--success'), 'success 变体')
  const v2 = renderVNode(ProgressBar, { value: 50, size: 'lg' }, mockCtx())!
  assert.ok(JSON.stringify(v2).includes('wf-progress--lg'), 'lg 尺寸')
})
