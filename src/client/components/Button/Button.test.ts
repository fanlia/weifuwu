import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Button } from './Button.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('Button', () => {
  it('renders primary variant by default', async () => {
    const vnode = await renderVNode(Button, { children: '提交' }, createTestCtx())!
    assert.equal(vnode.type, 'button')
    assert.match(vnode.props.class, /wf-btn--primary/)
  })

  it('sets type=button by default', async () => {
    const vnode = await renderVNode(Button, { children: '点击' }, createTestCtx())!
    assert.equal(vnode.props.type, 'button')
  })

  it('accepts type=submit', async () => {
    const vnode = await renderVNode(Button, { type: 'submit', children: '提交' }, createTestCtx())!
    assert.equal(vnode.props.type, 'submit')
  })

  it('disables when loading', async () => {
    const vnode = await renderVNode(Button, { loading: true, children: '保存' }, createTestCtx())!
    assert.equal(vnode.props.disabled, true)
  })

  it('disables when disabled prop is set', async () => {
    const vnode = await renderVNode(Button, { disabled: true, children: '不可用' }, createTestCtx())!
    assert.equal(vnode.props.disabled, true)
  })

  it('renders all variants', async () => {
    for (const v of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const vnode = await renderVNode(Button, { variant: v, children: '测试' }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-btn--${v}`))
    }
  })

  it('renders all sizes', async () => {
    for (const s of ['sm', 'md', 'lg'] as const) {
      const vnode = await renderVNode(Button, { size: s, children: '测试' }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-btn--${s}`))
    }
  })

  it('applies block class', async () => {
    const vnode = await renderVNode(Button, { block: true, children: '全宽' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-btn--block/)
  })

  it('renders children as content', async () => {
    const vnode = await renderVNode(Button, { children: '确定' }, createTestCtx())!
    assert.equal(vnode.props.children, '确定')
  })

  it('shows loading text when loading', async () => {
    const vnode = await renderVNode(Button, { loading: true, children: '保存' }, createTestCtx())!
    const children = vnode.props.children as any[]
    assert.match(children[0].props.class, /wf-btn-spinner/, '加载中渲染 spinner')
    assert.equal(children[1], '加载中...')
  })

  it('透传 id（测试定位/锚点）', async () => {
    const vnode = await renderVNode(Button, { id: 'async-click', children: '点击' }, createTestCtx())!
    assert.equal(vnode.props.id, 'async-click', 'id 透传到原生 button')
  })

  it('onClick 回调透传并触发', async () => {
    let clicked = 0
    const vnode = await renderVNode(Button, { onClick: () => clicked++ }, createTestCtx())!
    vnode.props.onClick()
    assert.equal(clicked, 1)
  })

  it('loading 时 disabled + aria-busy（点击被原生禁用拦截）', async () => {
    const vnode = await renderVNode(Button, { loading: true, onClick: () => {} }, createTestCtx())!
    assert.equal(vnode.props.disabled, true, 'loading 必须禁用按钮')
    assert.equal(vnode.props['aria-busy'], true, 'aria-busy 声明')
  })

  it('disabled 时透传原生 disabled', async () => {
    const vnode = await renderVNode(Button, { disabled: true }, createTestCtx())!
    assert.equal(vnode.props.disabled, true)
  })

  it('danger-ghost 变体渲染', async () => {
    const vnode = await renderVNode(Button, { variant: 'danger-ghost', children: '删除' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-btn--danger-ghost/)
  })
})

