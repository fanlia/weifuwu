import { describe, it } from 'node:test'
import assert from 'node:assert'
import { AspectRatio } from './AspectRatio.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('AspectRatio', () => {
  it('renders container with default 16/9 ratio', async () => {
    const vnode = await renderVNode(AspectRatio, { children: 'x' }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-aspect-ratio/)
    assert.equal(vnode.props.style['--wf-aspect-ratio'], '16 / 9')
  })

  it('accepts custom ratio', async () => {
    const vnode = await renderVNode(AspectRatio, { ratio: 4 / 3, children: 'x' }, createTestCtx())!
    assert.equal(vnode.props.style['--wf-aspect-ratio'], '1.3333333333333333')
  })

  it('passes children through', async () => {
    const vnode = await renderVNode(AspectRatio, { ratio: 1, children: '内容' }, createTestCtx())!
    assert.equal(vnode.props.children, '内容')
  })

  it('merges className', async () => {
    const vnode = await renderVNode(AspectRatio, { className: 'thumb', children: 'x' }, createTestCtx())!
    assert.match(vnode.props.class, /thumb/)
  })
})

it('宽高比经 CSS 变量传递（--wf-aspect-ratio）', async () => {
  const vnode = await renderVNode(AspectRatio, { ratio: 4 / 3, children: '内容' }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('--wf-aspect-ratio'), 'CSS 变量')
})

it('自定义 ratio 数值', async () => {
  const vnode = await renderVNode(AspectRatio, { ratio: 2, children: 'x' }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('2'), 'ratio 传递')
})
