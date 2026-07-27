/**
 * weifuwu/components — Img test
 */

import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { Img } from './Img.ts'

describe('Img', () => {
  it('renders img element with src and alt', () => {
    const vnode = Img({ src: '/photo.jpg', alt: '照片' }) as any
    assert.equal(vnode.type, 'img')
    assert.equal(vnode.props.src, '/photo.jpg')
    assert.equal(vnode.props.alt, '照片')
    assert.equal(vnode.props.loading, 'lazy')
  })

  it('renders fallback when no src', () => {
    const vnode = Img({ fallback: '/placeholder.png' }) as any
    assert.equal(vnode.props.src, '/placeholder.png')
  })

  it('sets onError handler when fallback provided', () => {
    const vnode = Img({ src: '/photo.jpg', fallback: '/placeholder.png' }) as any
    assert.equal(typeof vnode.props.onError, 'function')
  })

  it('no onError when no fallback', () => {
    const vnode = Img({ src: '/photo.jpg' }) as any
    assert.equal(vnode.props.onError, undefined)
  })

  it('supports loading eager', () => {
    const vnode = Img({ src: '/photo.jpg', loading: 'eager' }) as any
    assert.equal(vnode.props.loading, 'eager')
  })

  it('supports custom className', () => {
    const vnode = Img({ src: '/photo.jpg', className: 'rounded' }) as any
    assert.ok(vnode.props.class.includes('wf-image'))
    assert.ok(vnode.props.class.includes('rounded'))
  })

  it('supports width/height', () => {
    const vnode = Img({ src: '/photo.jpg', width: 200, height: 100 }) as any
    assert.equal(vnode.props.width, 200)
    assert.equal(vnode.props.height, 100)
  })
})
