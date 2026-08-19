import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Toggle, ToggleGroup } from './ToggleGroup.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx as officialCreateTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */


function createTestCtx(overrides?: Record<string, unknown>): UIContext {
  // 官方测试 ctx（vdom/testing——render/ui hooks mock——组件消费面）
  return officialCreateTestCtx(overrides as never)
}


describe('Toggle', () => {
  it('renders button with pressed state', async () => {
    const vnode = await renderVNode(Toggle, { pressed: true, children: 'B' }, createTestCtx())!
    assert.equal(vnode.type, 'button')
    assert.match(vnode.props.class, /wf-toggle/)
    assert.match(vnode.props.class, /wf-toggle--pressed/)
    assert.equal(vnode.props['aria-pressed'], 'true')
  })

  it('toggles on click', async () => {
    let got: boolean | null = null
    const vnode = await renderVNode(Toggle, { pressed: false, onPressedChange: (p: boolean) => { got = p }, children: 'B' }, createTestCtx())!
    vnode.props.onClick()
    assert.equal(got, true)
  })

  it('disabled: no click handler', async () => {
    let called = false
    const vnode = await renderVNode(Toggle, { pressed: false, disabled: true, onPressedChange: () => { called = true }, children: 'B' }, createTestCtx())!
    assert.equal(vnode.props.onClick, undefined)
    assert.equal(called, false)
  })

  it('merges className and passes size', async () => {
    const vnode = await renderVNode(Toggle, { size: 'sm', children: 'B' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-toggle--sm/)
  })
})

describe('ToggleGroup', () => {
  const opts = [
    { value: 'bold', label: 'B' },
    { value: 'italic', label: 'I' },
    { value: 'underline', label: 'U' },
  ]

  it('renders all options', async () => {
    const vnode = await renderVNode(ToggleGroup, { type: 'multiple', options: opts, value: [] }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-toggle-group/)
    assert.equal(vnode.props.children.length, 3)
  })

  it('single: value marks pressed option', async () => {
    const vnode = await renderVNode(ToggleGroup, { type: 'single', options: opts, value: 'italic' }, createTestCtx())!
    // 子项是 Toggle 组件 VNode（renderVNode 只渲染一层），断言传给 Toggle 的 props
    assert.equal(vnode.props.children[1].props.pressed, true)
    assert.equal(vnode.props.children[0].props.pressed, false)
  })

  it('single: click selects value', async () => {
    let got: string | null = null
    const vnode = await renderVNode(ToggleGroup, { type: 'single', options: opts, value: '', onChange: (v: any) => { got = v } }, createTestCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(got, 'underline')
  })

  it('multiple: click removes selected', async () => {
    let got: string[] = []
    const vnode = await renderVNode(ToggleGroup, { type: 'multiple', options: opts, value: ['bold'], onChange: (v: any) => { got = v } }, createTestCtx())!
    vnode.props.children[0].props.onClick() // bold → remove
    assert.deepEqual(got, [])
  })

  it('multiple: click adds unselected', async () => {
    let got: string[] = []
    const vnode = await renderVNode(ToggleGroup, { type: 'multiple', options: opts, value: ['bold'], onChange: (v: any) => { got = v } }, createTestCtx())!
    vnode.props.children[1].props.onClick() // italic → add
    assert.deepEqual(got, ['bold', 'italic'])
  })

  it('keyboard: ArrowRight in single mode moves selection', async () => {
    let got: string | null = null
    const vnode = await renderVNode(ToggleGroup, { type: 'single', options: opts, value: 'bold', onChange: (v: any) => { got = v } }, createTestCtx())!
    vnode.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => {} })
    assert.equal(got, 'italic')
    vnode.props.onKeyDown({ key: 'ArrowLeft', preventDefault: () => {} })
    assert.equal(got, 'bold')
  })

  it('disabled: no interaction', async () => {
    const vnode = await renderVNode(ToggleGroup, { type: 'single', options: opts, value: '', disabled: true }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.onClick, undefined)
  })

  it('renders sizes', async () => {
    const vnode = await renderVNode(ToggleGroup, { type: 'single', options: opts, value: '', size: 'lg' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-toggle-group--lg/)
  })
})
