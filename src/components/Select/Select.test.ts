import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Select } from './Select.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

function childrenOf(vnode: any): any[] {
  if (!vnode) return []
  return Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
}

describe('Select', () => {
  it('renders a select element', () => {
    const vnode = Select({ options: [{ value: 'a', label: 'A' }] }, mockCtx())!
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    assert.ok(select, 'should have a select element')
  })

  it('renders options from options prop', () => {
    const vnode = Select({ options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ]}, mockCtx())!
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    const options = Array.isArray(select.props.children) ? select.props.children : [select.props.children]
    assert.equal(options.length, 2)
    assert.equal(options[0].props.value, 'a')
    assert.equal(options[0].props.children, 'A')
  })

  it('renders label when provided', () => {
    const vnode = Select({ label: '角色', options: [{ value: 'admin', label: '管理员' }] }, mockCtx())!
    const label = childrenOf(vnode).find((c: any) => c?.type === 'label')
    assert.ok(label, 'should have a label element')
    assert.equal(label.props.children, '角色')
  })

  it('shows placeholder option', () => {
    const vnode = Select({ placeholder: '请选择', options: [{ value: 'a', label: 'A' }] }, mockCtx())!
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    const options = Array.isArray(select.props.children) ? select.props.children : [select.props.children]
    assert.equal(options.length, 2)
    assert.equal(options[0].props.value, '')
    assert.equal(options[0].props.children, '请选择')
  })

  it('shows error message', () => {
    const vnode = Select({ error: '请选择', options: [{ value: 'a', label: 'A' }] }, mockCtx())!
    const err = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-select-err')
    assert.ok(err, 'should have error element')
    assert.equal(err.props.children, '请选择')
  })
})
