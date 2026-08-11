import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Pagination } from './Pagination.ts'
import { Icon } from '../Icon/Icon.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  const uncontrolled = new Map<string, any>()
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    useControlled: (opts: any) => {
      const controlled = opts.value !== undefined
      const key = opts.name ?? 'default'
      if (!uncontrolled.has(key)) uncontrolled.set(key, opts.value)
      const setValue = (v: any) => {
        if (controlled) opts.onChange?.(v)
        else uncontrolled.set(key, v)
      }
      return { value: controlled ? opts.value : uncontrolled.get(key), setValue, controlled }
    },
  } } as any
}

describe('Pagination', () => {
  it('returns null when only one page', async () => {
    const result = await renderVNode(Pagination, { total: 5 }, createTestCtx())
    assert.equal(result, null)
  })

  it('renders page buttons', async () => {
    const vnode = await renderVNode(Pagination, { total: 50, page: 1 }, createTestCtx())!
    assert.equal(vnode.type, 'nav')
    assert.match(vnode.props.class, /wf-pagination/)
    // should have prev + pages + next
    assert.ok(vnode.props.children.length >= 3)
  })

  it('renders prev and next buttons', async () => {
    const vnode = await renderVNode(Pagination, { total: 50, page: 2 }, createTestCtx())!
    const children = vnode.props.children
    const first = children[0]
    const last = children[children.length - 1]
    // 前后页用 Icon（SVG 组件），按钮带 aria-label
    assert.ok(first.props['aria-label'])
    assert.equal(first.props.children.type, Icon)
    assert.equal(last.props.children.type, Icon)
  })

  it('disables prev on first page', async () => {
    const vnode = await renderVNode(Pagination, { total: 50, page: 1 }, createTestCtx())!
    const prev = vnode.props.children[0]
    assert.ok(prev.props.disabled)
  })

  it('disables next on last page', async () => {
    const vnode = await renderVNode(Pagination, { total: 50, page: 3, pageSize: 20 }, createTestCtx())!
    const next = vnode.props.children[vnode.props.children.length - 1]
    assert.ok(next.props.disabled)
  })

  it('highlights current page', async () => {
    const vnode = await renderVNode(Pagination, { total: 50, page: 2 }, createTestCtx())!
    const activeBtns = vnode.props.children.filter((c: any) =>
      c.props.class?.includes('wf-page-btn--active')
    )
    assert.equal(activeBtns.length, 1)
    assert.equal(activeBtns[0].props.children, '2')
  })
})

it('受控 page + onChange（点击页码回调）', async () => {
  let got: number | undefined
  const vnode = await renderVNode(Pagination, { total: 100, page: 1, pageSize: 10, onChange: (p: number) => { got = p } }, createTestCtx())!
  const find = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (n.props?.class?.includes?.('wf-page-btn') && n.props?.children === '2') return n
    const k = n.props?.children
    if (Array.isArray(k)) for (const c of k) { const f = find(c); if (f) return f }
    return null
  }
  const page3 = find(vnode)
  assert.ok(page3, '页码 2 按钮存在')
  page3.props.onClick()
  assert.equal(got, 2)
})

it('边界：total=0 → null（不渲染）', async () => {
  const vnode = await renderVNode(Pagination, { total: 0, page: 1 }, createTestCtx())
  assert.equal(vnode === null || !vnode, true, 'total=0 返回 null')
})
