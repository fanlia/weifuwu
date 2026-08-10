import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PageHeader } from './PageHeader.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('PageHeader', () => {
  it('renders title', () => {
    const vnode = renderVNode(PageHeader, { title: '用户管理' }, mockCtx())!
    const left = vnode.props.children[0]
    const h2 = left.props.children[0]
    assert.equal(h2.props.children, '用户管理')
  })

  it('renders subtitle when provided', () => {
    const vnode = renderVNode(PageHeader, { title: '用户管理', sub: '管理所有用户' }, mockCtx())!
    const left = vnode.props.children[0]
    const sub = left.props.children[1]
    assert.equal(sub.props.children, '管理所有用户')
  })

  it('renders actions when provided', () => {
    const vnode = renderVNode(PageHeader, { title: '用户管理', children: '按钮' }, mockCtx())!
    const actionsEl = vnode.props.children[1]
    assert.equal(actionsEl.props.class, 'wf-page-head-actions')
    assert.equal(actionsEl.props.children, '按钮')
  })
})
