import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Icon } from './Icon.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Icon', () => {
  it('renders svg with aria-hidden + currentColor', () => {
    const vnode = renderVNode(Icon, { name: 'close' }, mockCtx())!
    assert.equal(vnode.type, 'svg')
    assert.equal(vnode.props['aria-hidden'], 'true')
    assert.equal(vnode.props.stroke, 'currentColor')
    assert.match(vnode.props.class, /wf-icon/)
  })

  it('default size is 1em（随字号缩放）', () => {
    const vnode = renderVNode(Icon, { name: 'check' }, mockCtx())!
    assert.equal(vnode.props.width, '1em')
    assert.equal(vnode.props.height, '1em')
  })

  it('supports explicit size', () => {
    const vnode = renderVNode(Icon, { name: 'check', size: 16 }, mockCtx())!
    assert.equal(vnode.props.width, 16)
  })

  it('every icon name has paths', () => {
    const names = [
      'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right',
      'arrow-left', 'arrow-up', 'arrow-down', 'sort', 'sort-asc', 'sort-desc',
      'check', 'close', 'alert', 'info', 'warning', 'pause', 'settings',
      'search', 'send', 'stop', 'retry', 'upload', 'trash', 'edit', 'plus',
    ] as const
    for (const name of names) {
      const vnode = renderVNode(Icon, { name }, mockCtx())!
      const paths = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
      assert.ok(paths.length > 0, `${name} 应有 path`)
      assert.equal(vnode.type, 'svg')
    }
  })
})
