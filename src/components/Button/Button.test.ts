import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Button } from './Button.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Button', () => {
  it('renders primary variant by default', () => {
    const vnode = Button({ children: '提交' }, mockCtx())!
    assert.equal(vnode.type, 'button')
    assert.match(vnode.props.class, /wf-btn--primary/)
  })

  it('sets type=button by default', () => {
    const vnode = Button({ children: '点击' }, mockCtx())!
    assert.equal(vnode.props.type, 'button')
  })

  it('accepts type=submit', () => {
    const vnode = Button({ type: 'submit', children: '提交' }, mockCtx())!
    assert.equal(vnode.props.type, 'submit')
  })

  it('disables when loading', () => {
    const vnode = Button({ loading: true, children: '保存' }, mockCtx())!
    assert.equal(vnode.props.disabled, true)
  })

  it('disables when disabled prop is set', () => {
    const vnode = Button({ disabled: true, children: '不可用' }, mockCtx())!
    assert.equal(vnode.props.disabled, true)
  })

  it('renders all variants', () => {
    for (const v of ['primary', 'secondary', 'ghost', 'danger'] as const) {
      const vnode = Button({ variant: v, children: '测试' }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-btn--${v}`))
    }
  })

  it('renders all sizes', () => {
    for (const s of ['sm', 'md', 'lg'] as const) {
      const vnode = Button({ size: s, children: '测试' }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-btn--${s}`))
    }
  })

  it('applies block class', () => {
    const vnode = Button({ block: true, children: '全宽' }, mockCtx())!
    assert.match(vnode.props.class, /wf-btn--block/)
  })

  it('renders children as content', () => {
    const vnode = Button({ children: '确定' }, mockCtx())!
    assert.equal(vnode.props.children, '确定')
  })

  it('shows loading text when loading', () => {
    const vnode = Button({ loading: true, children: '保存' }, mockCtx())!
    assert.equal(vnode.props.children, '加载中...')
  })
})
