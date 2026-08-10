/**
 * weifuwu/components — Skeleton test
 */

import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { Skeleton } from './Skeleton.ts'
import { h, Fragment } from '../../ui-dom/vnode.ts'


function renderVNode(Comp, props) {
  const mockCtx = () => ({ ui: { $: {}, render: () => {}, dirty: () => {} } }) as any
  const result = Comp(props, mockCtx())
  const renderFn = typeof result === 'function' ? result : null
  return renderFn ? renderFn(props) : result
}

describe('Skeleton', () => {
  it('默认渲染单行 text', () => {
    const vnode = renderVNode(Skeleton, {}) as any
    assert.equal(vnode.type, 'div')
    assert.ok(vnode.props?.class?.includes('wf-skeleton'))
    assert.ok(vnode.props?.class?.includes('wf-skeleton--text'))
  })

  it('variant=circle', () => {
    const vnode = renderVNode(Skeleton, { variant: 'circle' }) as any
    assert.ok(vnode.props?.class?.includes('wf-skeleton--circle'))
  })

  it('variant=rect', () => {
    const vnode = renderVNode(Skeleton, { variant: 'rect' }) as any
    assert.ok(vnode.props?.class?.includes('wf-skeleton--rect'))
  })

  it('支持自定义宽高', () => {
    const vnode = renderVNode(Skeleton, { width: 100, height: 20 }) as any
    assert.equal(vnode.props?.style?.width, '100px')
    assert.equal(vnode.props?.style?.height, '20px')
  })

  it('支持 className', () => {
    const vnode = renderVNode(Skeleton, { className: 'my-extra' }) as any
    assert.ok(vnode.props?.class?.includes('my-extra'))
  })

  it('lines=3 渲染 Fragment 含 3 个 div', () => {
    const vnode = renderVNode(Skeleton, { lines: 3 }) as any
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
    const vnode = renderVNode(Skeleton, { lines: 1 }) as any
    assert.equal(vnode.type, 'div')
  })
})
