import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Field } from './Field.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Field', () => {
  it('renders children', async () => {
    const vnode = await renderVNode(Field, { children: '字段内容' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-field/)
    const content = vnode.props.children[0]
    assert.equal(content, '字段内容')
  })

  it('renders label when provided', async () => {
    const vnode = await renderVNode(Field, { label: '名称', children: '内容' }, createTestCtx())!
    const label = vnode.props.children[0]
    assert.equal(label.props.class, 'wf-field-label')
    assert.equal(label.props.children, '名称')
  })

  it('shows required marker', async () => {
    const vnode = await renderVNode(Field, { label: '名称', required: true, children: '内容' }, createTestCtx())!
    const labelContent = vnode.props.children[0].props.children
    const marker = Array.isArray(labelContent) ? labelContent[1] : null
    assert.ok(marker)
    assert.equal(marker.props.children, '*')
  })

  it('shows error message', async () => {
    const vnode = await renderVNode(Field, { error: '必填', children: '内容' }, createTestCtx())!
    const err = vnode.props.children[1]
    assert.equal(err.props.class, 'wf-field-err')
    assert.equal(err.props.children, '必填')
  })

  it('shows hint text', async () => {
    const vnode = await renderVNode(Field, { hint: '提示文字', children: '内容' }, createTestCtx())!
    const hint = vnode.props.children[1]
    assert.equal(hint.props.class, 'wf-field-hint')
    assert.equal(hint.props.children, '提示文字')
  })
})
