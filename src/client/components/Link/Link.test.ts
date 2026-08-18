import { test, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Link } from './Link.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'


describe('Link', () => {
  test('渲染 a 标签 + href + 内容', async () => {
    const vnode = await renderVNode(Link, { href: '/docs', children: '文档' }, createTestCtx())
    assert.equal(vnode.type, 'a')
    assert.equal(vnode.props.href, '/docs')
    assert.equal(vnode.props.children, '文档')
    assert.match(vnode.props.class, /wf-link/)
  })

  test('variant：primary / danger / muted', async () => {
    const v1 = await renderVNode(Link, { variant: 'primary', children: 'x' }, createTestCtx())
    assert.match(v1.props.class, /wf-link--primary/)
    const v2 = await renderVNode(Link, { variant: 'danger', children: 'x' }, createTestCtx())
    assert.match(v2.props.class, /wf-link--danger/)
  })

  test('underline=false 移除下划线', async () => {
    const vnode = await renderVNode(Link, { underline: false, children: 'x' }, createTestCtx())
    assert.match(vnode.props.class, /wf-link--no-underline/)
  })

  test('disabled：事件阻断 + aria-disabled', async () => {
    let clicked = 0
    const vnode = await renderVNode(Link, { disabled: true, onClick: () => clicked++, children: 'x' }, createTestCtx())
    vnode.props.onClick?.({ preventDefault: () => {}, stopPropagation: () => {} })
    assert.equal(clicked, 0, 'disabled 阻断点击')
    assert.equal(vnode.props['aria-disabled'], 'true')
  })

  test('target + rel 安全', async () => {
    const vnode = await renderVNode(Link, { href: 'https://x.com', target: '_blank', children: 'x' }, createTestCtx())
    assert.equal(vnode.props.target, '_blank')
    assert.equal(vnode.props.rel, 'noopener noreferrer')
  })

  test('icon 前置', async () => {
    const vnode = await renderVNode(Link, { icon: '→', children: '去' }, createTestCtx())
    const kids = vnode.props.children
    assert.ok(Array.isArray(kids) && kids[0] === '→')
  })
})

test('disabled：无 href + aria-disabled + 点击阻止', async () => {
  let clicked = 0
  const vnode = await renderVNode(Link, { href: '/x', disabled: true, onClick: () => clicked++, children: 'x' }, createTestCtx())!
  assert.equal(vnode.props.href, undefined, 'disabled 不输出 href')
  assert.equal(vnode.props['aria-disabled'], 'true')
  vnode.props.onClick({ preventDefault: () => {}, stopPropagation: () => {} })
  assert.equal(clicked, 0, 'disabled 阻断点击')
})

test('target=_blank 自动补 rel=noopener noreferrer（安全）', async () => {
  const vnode = await renderVNode(Link, { href: 'https://x.com', target: '_blank', children: 'x' }, createTestCtx())!
  assert.equal(vnode.props.rel, 'noopener noreferrer')
})

it('onClick 回调透传触发', async () => {
  let clicked = 0
  const vnode = await renderVNode(Link, { href: '#', onClick: () => { clicked++ } }, createTestCtx())!
  vnode.props.onClick()
  assert.equal(clicked, 1)
})

it('disabled 不调用用户 onClick（事件阻断）', async () => {
  let clicked = 0
  const vnode = await renderVNode(Link, { href: '#', disabled: true, onClick: () => { clicked++ } }, createTestCtx())!
  vnode.props.onClick({ preventDefault: () => {}, stopPropagation: () => {} })
  assert.equal(clicked, 0)
})
