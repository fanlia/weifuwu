import { describe, it } from 'node:test'
import assert from 'node:assert'
import { SearchInput } from './SearchInput.ts'
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

describe('SearchInput', () => {
  it('renders search container', () => {
    const vnode = renderVNode(SearchInput, {}, mockCtx())!
    assert.match(vnode.props.class, /wf-search/)
  })

  it('renders input element', () => {
    const vnode = renderVNode(SearchInput, {}, mockCtx())!
    const input = vnode.props.children[1]
    assert.equal(input.props.type, 'search')
  })

  it('renders default placeholder', () => {
    const vnode = renderVNode(SearchInput, {}, mockCtx())!
    const input = vnode.props.children[1]
    assert.equal(input.props.placeholder, '搜索...')
  })

  it('renders custom placeholder', () => {
    const vnode = renderVNode(SearchInput, { placeholder: '查找...' }, mockCtx())!
    const input = vnode.props.children[1]
    assert.equal(input.props.placeholder, '查找...')
  })

  it('renders clear button when value and onClear provided', () => {
    const vnode = renderVNode(SearchInput, { value: 'test', onClear: () => {} }, mockCtx())!
    const clearBtn = vnode.props.children[2]
    assert.ok(clearBtn)
    assert.match(clearBtn.props.class, /wf-search-clear/)
  })

  it('does not render clear button when value is empty', () => {
    const vnode = renderVNode(SearchInput, { value: '', onClear: () => {} }, mockCtx())!
    assert.equal(vnode.props.children.length, 2) // only icon + input
  })
})

it('有值时渲染清除按钮，点击触发 onClear', () => {
  let cleared = 0
  const vnode = renderVNode(SearchInput, { value: 'abc', onClear: () => cleared++ }, mockCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('clear'), '有值显示清除')
  const find = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (/clear/.test(String(n.props?.class ?? ''))) return n
    const k = n.props?.children
    if (Array.isArray(k)) for (const c of k) { const f = find(c); if (f) return f }
    return null
  }
  const btn = find(vnode)
  btn.props.onClick()
  assert.equal(cleared, 1)
})

it('空值不渲染清除按钮（边界）', () => {
  const vnode = renderVNode(SearchInput, { value: '' }, mockCtx())!
  assert.ok(!/clear/.test(JSON.stringify(vnode)), '空值无清除按钮')
})
