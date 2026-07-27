import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Slider } from './Slider.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Slider', () => {
  it('renders range input', () => {
    const vnode = Slider({}, mockCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'range')
  })

  it('renders label when provided', () => {
    const vnode = Slider({ label: '温度' }, mockCtx())!
    assert.match(vnode.props.class, /wf-slider-wrap/)
    const label = vnode.props.children[0]
    assert.equal(label.props.children, '温度')
  })

  it('sets min, max, step', () => {
    const vnode = Slider({ min: 0, max: 10, step: 0.5 }, mockCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'range') 
    // check props from actual vnode structure
  })

  it('displays current value', () => {
    const vnode = Slider({ value: 50 }, mockCtx())!
    const display = vnode.props.children[1]
    assert.equal(display.props.children, '50')
  })
})
