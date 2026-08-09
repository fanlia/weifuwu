import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Link } from './Link.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const mockCtx = () => ({ ui: { $: () => ({}), render: () => {}, dirty: () => {} } }) as any

describe('Link', () => {
  test('渲染 a 标签 + href + 内容', () => {
    const vnode = renderVNode(Link, { href: '/docs', children: '文档' }, mockCtx())
    assert.equal(vnode.type, 'a')
    assert.equal(vnode.props.href, '/docs')
    assert.equal(vnode.props.children, '文档')
    assert.match(vnode.props.class, /wf-link/)
  })

  test('variant：primary / danger / muted', () => {
    const v1 = renderVNode(Link, { variant: 'primary', children: 'x' }, mockCtx())
    assert.match(v1.props.class, /wf-link--primary/)
    const v2 = renderVNode(Link, { variant: 'danger', children: 'x' }, mockCtx())
    assert.match(v2.props.class, /wf-link--danger/)
  })

  test('underline=false 移除下划线', () => {
    const vnode = renderVNode(Link, { underline: false, children: 'x' }, mockCtx())
    assert.match(vnode.props.class, /wf-link--no-underline/)
  })

  test('disabled：事件阻断 + aria-disabled', () => {
    let clicked = 0
    const vnode = renderVNode(Link, { disabled: true, onClick: () => clicked++, children: 'x' }, mockCtx())
    vnode.props.onClick?.({ preventDefault: () => {}, stopPropagation: () => {} })
    assert.equal(clicked, 0, 'disabled 阻断点击')
    assert.equal(vnode.props['aria-disabled'], 'true')
  })

  test('target + rel 安全', () => {
    const vnode = renderVNode(Link, { href: 'https://x.com', target: '_blank', children: 'x' }, mockCtx())
    assert.equal(vnode.props.target, '_blank')
    assert.equal(vnode.props.rel, 'noopener noreferrer')
  })

  test('icon 前置', () => {
    const vnode = renderVNode(Link, { icon: '→', children: '去' }, mockCtx())
    const kids = vnode.props.children
    assert.ok(Array.isArray(kids) && kids[0] === '→')
  })
})
