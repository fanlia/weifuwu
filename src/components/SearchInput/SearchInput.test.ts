import { describe, it } from 'node:test'
import assert from 'node:assert'
import { SearchInput } from './SearchInput.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('SearchInput', () => {
  it('renders search container', () => {
    const vnode = SearchInput({}, mockCtx())!
    assert.match(vnode.props.class, /wf-search/)
  })

  it('renders input element', () => {
    const vnode = SearchInput({}, mockCtx())!
    const input = vnode.props.children[1]
    assert.equal(input.props.type, 'search')
  })

  it('renders default placeholder', () => {
    const vnode = SearchInput({}, mockCtx())!
    const input = vnode.props.children[1]
    assert.equal(input.props.placeholder, '搜索...')
  })

  it('renders custom placeholder', () => {
    const vnode = SearchInput({ placeholder: '查找...' }, mockCtx())!
    const input = vnode.props.children[1]
    assert.equal(input.props.placeholder, '查找...')
  })

  it('renders clear button when value and onClear provided', () => {
    const vnode = SearchInput({ value: 'test', onClear: () => {} }, mockCtx())!
    const clearBtn = vnode.props.children[2]
    assert.ok(clearBtn)
    assert.match(clearBtn.props.class, /wf-search-clear/)
  })

  it('does not render clear button when value is empty', () => {
    const vnode = SearchInput({ value: '', onClear: () => {} }, mockCtx())!
    assert.equal(vnode.props.children.length, 2) // only icon + input
  })
})
