/**
 * weifuwu/components — Img test
 */

import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { Img } from './Img.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

function makeCtx(): any {
  return createTestCtx({ ui: { useGlobalKey: () => () => {} } }) as any
}



describe('Img', () => {
  it('renders img element with src and alt', () => {
    const vnode = renderVNode(Img, { src: '/photo.jpg', alt: '照片' }, makeCtx()) as any
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, '/photo.jpg')
    assert.equal(vnode.props.alt, '照片')
    assert.equal(vnode.props.loading, 'lazy')
  })

  it('renders fallback when no src', () => {
    const vnode = renderVNode(Img, { fallback: '/placeholder.png' }, makeCtx()) as any
    assert.equal(vnode.props.src, '/placeholder.png')
  })

  it('sets onError handler when fallback provided', () => {
    const vnode = renderVNode(Img, { src: '/photo.jpg', fallback: '/placeholder.png' }, makeCtx()) as any
    assert.equal(typeof vnode.props.onError, 'function')
  })

  it('no onError when no fallback', () => {
    const vnode = renderVNode(Img, { src: '/photo.jpg' }, makeCtx()) as any
    assert.equal(vnode.props.onError, undefined)
  })

  it('supports loading eager', () => {
    const vnode = renderVNode(Img, { src: '/photo.jpg', loading: 'eager' }, makeCtx()) as any
    assert.equal(vnode.props.loading, 'eager')
  })

  it('supports custom className', () => {
    const vnode = renderVNode(Img, { src: '/photo.jpg', className: 'rounded' }, makeCtx()) as any
    assert.ok(vnode.props.class.includes('wf-image'))
    assert.ok(vnode.props.class.includes('rounded'))
  })

  it('supports width/height', () => {
    const vnode = renderVNode(Img, { src: '/photo.jpg', width: 200, height: 100 }, makeCtx()) as any
    assert.equal(vnode.props.width, 200)
    assert.equal(vnode.props.height, 100)
  })
})

it('src 缺失时渲染 fallback（边界）', () => {
  const vnode = renderVNode(Img, { fallback: 'data:image/svg+xml,x', alt: 'x' }, makeCtx())
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('data:image/svg+xml') || s.includes('wf-img'), 'fallback 或占位渲染')
})
