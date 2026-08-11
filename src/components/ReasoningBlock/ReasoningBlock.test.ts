import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ReasoningBlock } from './ReasoningBlock.ts'
import { renderVNode, mountComponent, findByClass, createTestCtx } from '../../ui-dom/testing.ts'

describe('ReasoningBlock', () => {
  it('默认折叠：aria-expanded=false + 正文不可见', async () => {
    const v = await renderVNode(ReasoningBlock, { content: '先分析用户意图…' }, createTestCtx())!
    assert.ok(findByClass(v, 'wf-reasoning').length === 1)
    const toggle = findByClass(v, 'wf-reasoning-toggle')[0]
    assert.equal(toggle.props['aria-expanded'], false)
    const body = findByClass(v, 'wf-reasoning-body')[0]
    assert.ok(body.props.hidden || !String(body.props.class).includes('open'), '正文隐藏')
  })

  it('点击展开 → aria-expanded=true + 正文可见', async () => {
    const render = await mountComponent(ReasoningBlock, { content: '推理文本' }, createTestCtx())
    let v = render()
    const toggle = findByClass(v, 'wf-reasoning-toggle')[0]
    toggle.props.onClick()
    v = render()
    assert.equal(findByClass(v, 'wf-reasoning-toggle')[0].props['aria-expanded'], true)
    const body = findByClass(v, 'wf-reasoning-body')[0]
    assert.ok(String(body.props.class).includes('open'), '正文可见')
    assert.equal(body.props.children, '推理文本')
  })

  it('defaultExpanded → 初始展开', async () => {
    const v = await renderVNode(ReasoningBlock, { content: 'x', defaultExpanded: true }, createTestCtx())!
    assert.equal(findByClass(v, 'wf-reasoning-toggle')[0].props['aria-expanded'], true)
  })

  it('streaming → 流式类 + 指示点', async () => {
    const v = await renderVNode(ReasoningBlock, { content: 'x', streaming: true }, createTestCtx())!
    assert.ok(findByClass(v, 'wf-reasoning--streaming').length === 1, '流式类')
  })

  it('自定义 label + 键盘可达（Enter 切换）', async () => {
    const render = await mountComponent(ReasoningBlock, { content: 'x', label: '思考过程' }, createTestCtx())
    let v = render()
    const toggle = findByClass(v, 'wf-reasoning-toggle')[0]
    assert.ok(String(toggle.props.children).includes('思考过程') || JSON.stringify(toggle.props.children).includes('思考过程'))
    toggle.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    v = render()
    assert.equal(findByClass(v, 'wf-reasoning-toggle')[0].props['aria-expanded'], true)
  })

  it('空格键同样切换（键盘红线：可聚焦即可操作）', async () => {
    const render = await mountComponent(ReasoningBlock, { content: 'x' }, createTestCtx())
    let v = render()
    findByClass(v, 'wf-reasoning-toggle')[0].props.onKeyDown({ key: ' ', preventDefault: () => {} })
    v = render()
    assert.equal(findByClass(v, 'wf-reasoning-toggle')[0].props['aria-expanded'], true)
  })

  it('再次点击收起 → aria-expanded 还原 false', async () => {
    const render = await mountComponent(ReasoningBlock, { content: 'x', defaultExpanded: true }, createTestCtx())
    let v = render()
    findByClass(v, 'wf-reasoning-toggle')[0].props.onClick()
    v = render()
    assert.equal(findByClass(v, 'wf-reasoning-toggle')[0].props['aria-expanded'], false)
    assert.equal(findByClass(v, 'wf-reasoning-body')[0].props.hidden, true)
  })

  it('streaming 时头部 label 带省略号（“已思考…”）', async () => {
    const v = await renderVNode(ReasoningBlock, { content: 'x', streaming: true }, createTestCtx())!
    const label = findByClass(v, 'wf-reasoning-label')[0]
    assert.ok(String(label.props.children).includes('…'))
  })
})
