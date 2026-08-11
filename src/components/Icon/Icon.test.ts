import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Icon } from './Icon.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Icon', () => {
  it('renders svg with aria-hidden + currentColor', async () => {
    const vnode = await renderVNode(Icon, { name: 'close' }, createTestCtx())!
    assert.equal(vnode.type, 'svg')
    assert.equal(vnode.props['aria-hidden'], 'true')
    assert.equal(vnode.props.stroke, 'currentColor')
    assert.match(vnode.props.class, /wf-icon/)
  })

  it('default size is 1em（随字号缩放）', async () => {
    const vnode = await renderVNode(Icon, { name: 'check' }, createTestCtx())!
    assert.equal(vnode.props.width, '1em')
    assert.equal(vnode.props.height, '1em')
  })

  it('supports explicit size', async () => {
    const vnode = await renderVNode(Icon, { name: 'check', size: 16 }, createTestCtx())!
    assert.equal(vnode.props.width, 16)
  })

  it('every icon name has paths', async () => {
    const names = [
      'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right',
      'arrow-left', 'arrow-up', 'arrow-down', 'sort', 'sort-asc', 'sort-desc',
      'check', 'close', 'alert', 'info', 'warning', 'pause', 'settings',
      'search', 'send', 'stop', 'retry', 'upload', 'trash', 'edit', 'plus',
    ] as const
    for (const name of names) {
      const vnode = await renderVNode(Icon, { name }, createTestCtx())!
      const paths = Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
      assert.ok(paths.length > 0, `${name} 应有 path`)
      assert.equal(vnode.type, 'svg')
    }
  })
})
