import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Field } from './Field.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */



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

it('error 时隐藏 hint（错误优先语义）', async () => {
  const vnode = await renderVNode(Field, { error: '必填', hint: '最多 10 字', children: 'x' }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-field-err'), '错误显示')
  assert.ok(!s.includes('wf-field-hint'), 'error 时 hint 隐藏')
})

it('error 时容器带 --err 类', async () => {
  const vnode = await renderVNode(Field, { error: 'x', children: 'y' }, createTestCtx())!
  assert.match(vnode.props.class, /wf-field--err/)
})

it('无 label 精简（children 直接）', async () => {
  const vnode = await renderVNode(Field, { children: '内容' }, createTestCtx())!
  assert.equal(vnode.props.children.length, 1, '仅 children')
})

it('required 标记 *（含 aria-hidden 声明装饰性）', async () => {
  const vnode = await renderVNode(Field, { label: '名称', required: true, children: 'x' }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-field-req'), 'required 标记')
  assert.ok(s.includes('*'), '星号渲染')
})

it('label 为 label 元素（可点击聚焦联动）', async () => {
  const vnode = await renderVNode(Field, { label: '邮箱', children: 'x' }, createTestCtx())!
  const label = vnode.props.children[0]
  assert.equal(label.type, 'label')
  assert.equal(label.props.class, 'wf-field-label')
})
