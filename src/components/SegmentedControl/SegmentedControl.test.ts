import { describe, it } from 'node:test'
import assert from 'node:assert'
import { SegmentedControl } from './SegmentedControl.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

const options = [
  { value: 'ai', label: 'AI 生成' },
  { value: 'manual', label: '手动编写' },
  { value: 'template', label: '模板', disabled: true },
]

describe('SegmentedControl', () => {
  it('renders a group with one button per option', () => {
    const vnode = renderVNode(SegmentedControl, { options }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-segmented/)
    assert.equal(vnode.props.role, 'group')
    assert.equal(vnode.props.children.length, 3)
  })

  it('marks the active option with aria-pressed and class', () => {
    const vnode = renderVNode(SegmentedControl, { options, value: 'ai' }, mockCtx())!
    const [ai, manual] = vnode.props.children
    assert.match(ai.props.class, /wf-segmented-option--active/)
    assert.equal(ai.props['aria-pressed'], 'true')
    assert.equal(manual.props['aria-pressed'], 'false')
  })

  it('fires onChange with the clicked value', () => {
    let got: string | undefined
    const vnode = renderVNode(SegmentedControl, { options, value: 'ai', onChange: (v: string) => { got = v } }, mockCtx())!
    vnode.props.children[1].props.onClick()
    assert.equal(got, 'manual')
  })

  it('disabled options do not fire onChange', () => {
    let fired = false
    const vnode = renderVNode(SegmentedControl, { options, onChange: () => { fired = true } }, mockCtx())!
    assert.equal(vnode.props.children[2].props.disabled, true)
    assert.equal(vnode.props.children[2].props.onClick, undefined, 'disabled option should not bind onClick')
    vnode.props.children[0].props.onClick()
    assert.equal(fired, true, 'enabled option still fires')
  })

  it('applies size and block classes', () => {
    const sm = renderVNode(SegmentedControl, { options, size: 'sm' }, mockCtx())!
    const block = renderVNode(SegmentedControl, { options, block: true }, mockCtx())!
    assert.match(sm.props.class, /wf-segmented--sm/)
    assert.match(block.props.class, /wf-segmented--block/)
  })
})
