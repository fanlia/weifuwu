import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Input } from './Input.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */


function childrenOf(vnode: any): any[] {
  if (!vnode) return []
  return Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
}

describe('Input', () => {
  it('renders an input element', async () => {
    // without label/error/hint, renders bare input
    const vnode = await renderVNode(Input, {}, createTestCtx())!
    assert.equal(vnode.type, 'input')
    assert.equal(vnode.props.type, 'text')
  })

  it('renders label when provided', async () => {
    const vnode = await renderVNode(Input, { label: '邮箱' }, createTestCtx())!
    const label = childrenOf(vnode).find((c: any) => c?.type === 'label')
    assert.ok(label, 'should have a label element')
    assert.equal(label.props.children, '邮箱')
  })

  it('shows required marker', async () => {
    const vnode = await renderVNode(Input, { label: '邮箱', required: true }, createTestCtx())!
    const label = childrenOf(vnode).find((c: any) => c?.type === 'label')
    const marker = Array.isArray(label.props.children)
      ? label.props.children.find((c: any) => c?.props?.class === 'wf-input-req')
      : null
    assert.ok(marker, 'should have required marker')
  })

  it('shows error message', async () => {
    const vnode = await renderVNode(Input, { error: '必填' }, createTestCtx())!
    const err = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-input-err')
    assert.ok(err, 'should have error element')
    assert.equal(err.props.children, '必填')
  })

  it('shows hint text', async () => {
    const vnode = await renderVNode(Input, { hint: '请输入邮箱' }, createTestCtx())!
    const hint = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-input-hint')
    assert.ok(hint, 'should have hint element')
    assert.equal(hint.props.children, '请输入邮箱')
  })

  it('hides hint when error is present', async () => {
    const vnode = await renderVNode(Input, { hint: '提示', error: '错误' }, createTestCtx())!
    const hint = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-input-hint')
    assert.ok(!hint, 'should not have hint when error is present')
  })

  it('sets input type', async () => {
    const vnode = await renderVNode(Input, { type: 'email' }, createTestCtx())!
    // without label/error/hint, vnode is bare input
    assert.equal(vnode.type, 'input')
    assert.equal(vnode.props.type, 'email')
  })

  it('applies borderless variant class', async () => {
    const vnode = await renderVNode(Input, { variant: 'borderless' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-input--borderless/)
    const plain = await renderVNode(Input, {}, createTestCtx())!
    assert.doesNotMatch(plain.props.class, /--borderless/)
  })
})
