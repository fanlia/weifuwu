import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Pagination } from './Pagination.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Pagination', () => {
  it('returns null when only one page', () => {
    const result = Pagination({ total: 5 }, mockCtx())
    assert.equal(result, null)
  })

  it('renders page buttons', () => {
    const vnode = Pagination({ total: 50, page: 1 }, mockCtx())!
    assert.equal(vnode.type, 'nav')
    assert.match(vnode.props.class, /wf-pagination/)
    // should have prev + pages + next
    assert.ok(vnode.props.children.length >= 3)
  })

  it('renders prev and next buttons', () => {
    const vnode = Pagination({ total: 50, page: 2 }, mockCtx())!
    const children = vnode.props.children
    const first = children[0]
    const last = children[children.length - 1]
    assert.equal(first.props.children, '‹')
    assert.equal(last.props.children, '›')
  })

  it('disables prev on first page', () => {
    const vnode = Pagination({ total: 50, page: 1 }, mockCtx())!
    const prev = vnode.props.children[0]
    assert.ok(prev.props.disabled)
  })

  it('disables next on last page', () => {
    const vnode = Pagination({ total: 50, page: 3, pageSize: 20 }, mockCtx())!
    const next = vnode.props.children[vnode.props.children.length - 1]
    assert.ok(next.props.disabled)
  })

  it('highlights current page', () => {
    const vnode = Pagination({ total: 50, page: 2 }, mockCtx())!
    const activeBtns = vnode.props.children.filter((c: any) =>
      c.props.class?.includes('wf-page-btn--active')
    )
    assert.equal(activeBtns.length, 1)
    assert.equal(activeBtns[0].props.children, '2')
  })
})
