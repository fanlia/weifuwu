import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Steps } from './Steps.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Steps', () => {
  const items = [
    { key: 'a', label: '第一步' },
    { key: 'b', label: '第二步' },
    { key: 'c', label: '第三步' },
  ]

  it('renders step items', () => {
    const vnode = renderVNode(Steps, { items }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-steps/)
    assert.equal(vnode.props.children.length, 3)
  })

  it('renders step labels', () => {
    const vnode = renderVNode(Steps, { items }, mockCtx())!
    assert.equal(vnode.props.children[0].props.children[1].props.children, '第一步')
  })

  it('marks done steps with checkmark', () => {
    const vnode = renderVNode(Steps, { items, current: 1 }, mockCtx())!
    // step 0 should be done (has checkmark)
    const num0 = vnode.props.children[0].props.children[0]
    assert.equal(num0.props.children, '✓')
  })

  it('marks current step', () => {
    const vnode = renderVNode(Steps, { items, active: 'b' }, mockCtx())!
    assert.match(vnode.props.children[1].props.class, /wf-step--current/)
  })
})
