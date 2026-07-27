import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Field } from './Field.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Field', () => {
  it('renders children', () => {
    const vnode = Field({ children: '字段内容' }, mockCtx())!
    assert.match(vnode.props.class, /wf-field/)
    const content = vnode.props.children[0]
    assert.equal(content, '字段内容')
  })

  it('renders label when provided', () => {
    const vnode = Field({ label: '名称', children: '内容' }, mockCtx())!
    const label = vnode.props.children[0]
    assert.equal(label.props.class, 'wf-field-label')
    assert.equal(label.props.children, '名称')
  })

  it('shows required marker', () => {
    const vnode = Field({ label: '名称', required: true, children: '内容' }, mockCtx())!
    const labelContent = vnode.props.children[0].props.children
    const marker = Array.isArray(labelContent) ? labelContent[1] : null
    assert.ok(marker)
    assert.equal(marker.props.children, '*')
  })

  it('shows error message', () => {
    const vnode = Field({ error: '必填', children: '内容' }, mockCtx())!
    const err = vnode.props.children[1]
    assert.equal(err.props.class, 'wf-field-err')
    assert.equal(err.props.children, '必填')
  })

  it('shows hint text', () => {
    const vnode = Field({ hint: '提示文字', children: '内容' }, mockCtx())!
    const hint = vnode.props.children[1]
    assert.equal(hint.props.class, 'wf-field-hint')
    assert.equal(hint.props.children, '提示文字')
  })
})
