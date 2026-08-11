import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Slider } from './Slider.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Slider', () => {
  it('renders range input', async () => {
    const vnode = await renderVNode(Slider, {}, createTestCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'range')
  })

  it('renders label when provided', async () => {
    const vnode = await renderVNode(Slider, { label: '温度' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-slider-wrap/)
    const label = vnode.props.children[0]
    assert.equal(label.props.children, '温度')
  })

  it('sets min, max, step', async () => {
    const vnode = await renderVNode(Slider, { min: 0, max: 10, step: 0.5 }, createTestCtx())!
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'range') 
    // check props from actual vnode structure
  })

  it('displays current value', async () => {
    const vnode = await renderVNode(Slider, { value: 50 }, createTestCtx())!
    const display = vnode.props.children[1]
    assert.equal(display.props.children, '50')
  })
})

it('min/max/step 传递到原生 range', async () => {
  const vnode = await renderVNode(Slider, { value: 5, min: 0, max: 10, step: 1 }, createTestCtx())!
  const input = JSON.stringify(vnode)
  assert.ok(input.includes('"min":0') && input.includes('"max":10') && input.includes('"step":1'))
})

it('onChange 数值化（string → Number）', async () => {
  let got: number | undefined
  const vnode = await renderVNode(Slider, { value: 0, onChange: (v: number) => { got = v } }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-slider-input'))
  // 找 input 调 onChange
  const find = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (n.props?.class === 'wf-slider-input') return n
    const k = n.props?.children
    if (Array.isArray(k)) { for (const c of k) { const f = find(c); if (f) return f } }
    return null
  }
  find(vnode).props.onChange({ target: { value: '42' } })
  assert.equal(got, 42)
  assert.equal(typeof got, 'number')
})

it('轨道渐变百分比（value=50 → 50%）', async () => {
  const vnode = await renderVNode(Slider, { value: 50, min: 0, max: 100 }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('50%'), '渐变包含 50%')
})

it('label 渲染 + 无 label 精简结构（边界）', async () => {
  const withLabel = await renderVNode(Slider, { label: '音量', value: 1 }, createTestCtx())!
  assert.ok(JSON.stringify(withLabel).includes('wf-slider-label'))
  const noLabel = await renderVNode(Slider, { value: 1 }, createTestCtx())!
  assert.ok(!JSON.stringify(noLabel).includes('wf-slider-label'))
})
