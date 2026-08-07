import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Pagination } from './Pagination.ts'
import { Icon } from '../Icon/Icon.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Pagination', () => {
  it('returns null when only one page', () => {
    const result = renderVNode(Pagination, { total: 5 }, mockCtx())
    assert.equal(result, null)
  })

  it('renders page buttons', () => {
    const vnode = renderVNode(Pagination, { total: 50, page: 1 }, mockCtx())!
    assert.equal(vnode.type, 'nav')
    assert.match(vnode.props.class, /wf-pagination/)
    // should have prev + pages + next
    assert.ok(vnode.props.children.length >= 3)
  })

  it('renders prev and next buttons', () => {
    const vnode = renderVNode(Pagination, { total: 50, page: 2 }, mockCtx())!
    const children = vnode.props.children
    const first = children[0]
    const last = children[children.length - 1]
    // 前后页用 Icon（SVG 组件），按钮带 aria-label
    assert.ok(first.props['aria-label'])
    assert.equal(first.props.children.type, Icon)
    assert.equal(last.props.children.type, Icon)
  })

  it('disables prev on first page', () => {
    const vnode = renderVNode(Pagination, { total: 50, page: 1 }, mockCtx())!
    const prev = vnode.props.children[0]
    assert.ok(prev.props.disabled)
  })

  it('disables next on last page', () => {
    const vnode = renderVNode(Pagination, { total: 50, page: 3, pageSize: 20 }, mockCtx())!
    const next = vnode.props.children[vnode.props.children.length - 1]
    assert.ok(next.props.disabled)
  })

  it('highlights current page', () => {
    const vnode = renderVNode(Pagination, { total: 50, page: 2 }, mockCtx())!
    const activeBtns = vnode.props.children.filter((c: any) =>
      c.props.class?.includes('wf-page-btn--active')
    )
    assert.equal(activeBtns.length, 1)
    assert.equal(activeBtns[0].props.children, '2')
  })
})
