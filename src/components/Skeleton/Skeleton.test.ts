/**
 * weifuwu/components — Skeleton test
 */

import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { Skeleton } from './Skeleton.ts'
import { h, Fragment } from '../../ui-dom/vnode.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'



describe('Skeleton', () => {
  it('默认渲染单行 text', () => {
    const vnode = renderVNode(Skeleton, {}, createTestCtx()) as any
    assert.equal(vnode.type, 'div')
    assert.ok(vnode.props?.class?.includes('wf-skeleton'))
    assert.ok(vnode.props?.class?.includes('wf-skeleton--text'))
  })

  it('variant=circle', () => {
    const vnode = renderVNode(Skeleton, { variant: 'circle' }, createTestCtx()) as any
    assert.ok(vnode.props?.class?.includes('wf-skeleton--circle'))
  })

  it('variant=rect', () => {
    const vnode = renderVNode(Skeleton, { variant: 'rect' }, createTestCtx()) as any
    assert.ok(vnode.props?.class?.includes('wf-skeleton--rect'))
  })

  it('支持自定义宽高', () => {
    const vnode = renderVNode(Skeleton, { width: 100, height: 20 }, createTestCtx()) as any
    assert.equal(vnode.props?.style?.width, '100px')
    assert.equal(vnode.props?.style?.height, '20px')
  })

  it('支持 className', () => {
    const vnode = renderVNode(Skeleton, { className: 'my-extra' }, createTestCtx()) as any
    assert.ok(vnode.props?.class?.includes('my-extra'))
  })

  it('lines=3 渲染 Fragment 含 3 个 div', () => {
    const vnode = renderVNode(Skeleton, { lines: 3 }, createTestCtx()) as any
    assert.equal(vnode.type, Fragment)
    const children = vnode.props?.children ?? []
    assert.equal(children.length, 3)
    children.forEach((c: any, i: number) => {
      assert.equal(c.type, 'div')
      assert.ok(c.props?.class?.includes('wf-skeleton'))
      if (i === 2) {
        assert.ok(c.props?.class?.includes('wf-skeleton--short'), '最后一行应有 --short class')
      }
    })
  })

  it('lines=1 渲染单 div', () => {
    const vnode = renderVNode(Skeleton, { lines: 1 }, createTestCtx()) as any
    assert.equal(vnode.type, 'div')
  })
})
