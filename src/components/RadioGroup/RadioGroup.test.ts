import { describe, it } from 'node:test'
import assert from 'node:assert'
import { RadioGroup } from './RadioGroup.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  const uncontrolled = new Map<string, any>()
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true,
    useControlled: (opts: any) => {
      const controlled = opts.value !== undefined
      const key = opts.name ?? 'default'
      if (!uncontrolled.has(key)) uncontrolled.set(key, opts.value)
      const setValue = (v: any) => {
        if (controlled) opts.onChange?.(v)
        else uncontrolled.set(key, v)
      }
      return { value: controlled ? opts.value : uncontrolled.get(key), setValue, controlled }
    },
  } } as any
}

describe('RadioGroup', () => {
  const options = [
    { value: 'a', label: '选项A' },
    { value: 'b', label: '选项B' },
  ]

  it('renders radio options', () => {
    const vnode = renderVNode(RadioGroup, { options }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-radio-group/)
    assert.equal(vnode.props.children.length, 2)
  })

  it('renders label text for each option', () => {
    const vnode = renderVNode(RadioGroup, { options }, mockCtx())!
    const firstLabel = vnode.props.children[0].props.children[2]
    assert.equal(firstLabel.props.children, '选项A')
  })

  it('sets checked state based on value', () => {
    const vnode = renderVNode(RadioGroup, { options, value: 'b' }, mockCtx())!
    const inputs = vnode.props.children.map((c: any) => c.props.children[0])
    assert.equal(inputs[0].props.checked, undefined)
    assert.equal(inputs[1].props.checked, true)
  })

  it('renders inline class when inline prop is set', () => {
    const vnode = renderVNode(RadioGroup, { options, inline: true }, mockCtx())!
    assert.match(vnode.props.class, /wf-radio-group--inline/)
  })
})
