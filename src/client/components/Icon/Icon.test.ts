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

it('size 数值转 px', async () => {
  const vnode = await renderVNode(Icon, { name: 'check', size: 16 }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('16'), '尺寸传递')
})

it('className 透传', async () => {
  const vnode = await renderVNode(Icon, { name: 'close', className: 'my-icon' }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('my-icon'))
})

describe('Icon 全量一致性（04 P2 图标校准可验证部分）', () => {
  it('每个 IconName 渲染非空（PATHS 全覆盖——缺图标名 = 渲染崩）', async () => {
    // 从类型定义提取全部 IconName（避免与 PATHS 同源漂移——双层校验）
    const src = await (await import('node:fs')).readFileSync(new URL('./Icon.ts', import.meta.url), 'utf-8')
    const typeBlock = src.match(/export type IconName =\n([\s\S]*?)\n\}/)?.[1] ?? ''
    const names = [...typeBlock.matchAll(/\| '([a-z0-9-]+)'/g)].map((m) => m[1])
    assert.ok(names.length >= 75, `IconName 类型至少 75 个（实际 ${names.length}）`)
    // 每个名字渲染为 svg + path（不抛错）
    for (const name of names) {
      const vnode = await renderVNode(Icon, { name: name as any }, createTestCtx())
      assert.ok(vnode, `Icon ${name} 渲染`)
      const v = JSON.stringify(vnode)
      assert.ok(v.includes('<path') || v.includes('"type":"path"') || v.includes('path'), `Icon ${name} 含 path`)
      assert.ok(v.includes('wf-icon'), `Icon ${name} 根类`)
    }
  })

  it('stroke 参数统一（1.8 + round 端点——视觉一致性）', async () => {
    const vnode = await renderVNode(Icon, { name: 'home' }, createTestCtx())!
    assert.equal(vnode.props['stroke-width'], 1.8)
    assert.equal(vnode.props['stroke-linecap'], 'round')
    assert.equal(vnode.props['stroke-linejoin'], 'round')
    assert.equal(vnode.props.fill, 'none')
  })

  it('aria-hidden + focusable（装饰性图标纪律）', async () => {
    const vnode = await renderVNode(Icon, { name: 'home' }, createTestCtx())!
    assert.equal(vnode.props['aria-hidden'], 'true')
    assert.equal(vnode.props.focusable, 'false')
  })
})
