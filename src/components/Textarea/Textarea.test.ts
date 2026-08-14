import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Textarea } from './Textarea.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

function childrenOf(vnode: any): any[] {
  if (!vnode) return []
  return Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
}

describe('Textarea', () => {
  it('renders a textarea element', async () => {
    const vnode = await renderVNode(Textarea, {}, createTestCtx())!
    const ta = childrenOf(vnode).find((c: any) => c?.type === 'textarea')
    assert.ok(ta, 'should have a textarea element')
  })

  it('renders label when provided', async () => {
    const vnode = await renderVNode(Textarea, { label: '简介' }, createTestCtx())!
    const label = childrenOf(vnode).find((c: any) => c?.type === 'label')
    assert.ok(label, 'should have a label element')
    assert.equal(label.props.children, '简介')
  })

  it('sets default rows to 3', async () => {
    const vnode = await renderVNode(Textarea, {}, createTestCtx())!
    const ta = childrenOf(vnode).find((c: any) => c?.type === 'textarea')
    assert.equal(ta.props.rows, 3)
  })

  it('accepts custom rows', async () => {
    const vnode = await renderVNode(Textarea, { rows: 6 }, createTestCtx())!
    const ta = childrenOf(vnode).find((c: any) => c?.type === 'textarea')
    assert.equal(ta.props.rows, 6)
  })

  it('shows error message', async () => {
    const vnode = await renderVNode(Textarea, { error: '必填' }, createTestCtx())!
    const err = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-textarea-err')
    assert.ok(err, 'should have error element')
    assert.equal(err.props.children, '必填')
  })

  it('forwards maxLength to the textarea', async () => {
    const vnode = await renderVNode(Textarea, { maxLength: 120 }, createTestCtx())!
    const ta = childrenOf(vnode).find((c: any) => c?.type === 'textarea')
    assert.equal(ta.props.maxLength, 120)
  })

  it('shows counter with value length and max', async () => {
    const vnode = await renderVNode(Textarea, { value: 'hello', maxLength: 10, showCount: true }, createTestCtx())!
    const count = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-textarea-count')
    assert.ok(count, 'should have counter element')
    assert.equal(count.props.children, '5/10')
  })

  it('marks counter over limit', async () => {
    const vnode = await renderVNode(Textarea, { value: '超出长度', maxLength: 2, showCount: true }, createTestCtx())!
    const count = childrenOf(vnode).find((c: any) => c?.props?.class?.includes('wf-textarea-count--over'))
    assert.ok(count, 'counter should have over class')
  })

  it('value 受控透传 + onInput 回调', async () => {
    let got: any = null
    const vnode = await renderVNode(Textarea, { value: '内容', onInput: (e: any) => { got = e } }, createTestCtx())!
    const ta = childrenOf(vnode).find((c: any) => c?.type === 'textarea')
    assert.equal(ta.props.value, '内容')
    ta.props.onInput({ target: { value: '新' } })
    assert.ok(got, 'onInput 触发')
  })

  it('disabled / placeholder / required 透传', async () => {
    const vnode = await renderVNode(Textarea, { disabled: true, placeholder: '描述…', required: true }, createTestCtx())!
    const ta = childrenOf(vnode).find((c: any) => c?.type === 'textarea')
    assert.equal(ta.props.disabled, true)
    assert.equal(ta.props.placeholder, '描述…')
    assert.equal(ta.props.required, true)
  })

  it('无 showCount 不渲染计数', async () => {
    const vnode = await renderVNode(Textarea, { value: 'hello', maxLength: 10 }, createTestCtx())!
    const count = childrenOf(vnode).find((c: any) => c?.props?.class?.includes('wf-textarea-count'))
    assert.equal(count, undefined)
  })
})
