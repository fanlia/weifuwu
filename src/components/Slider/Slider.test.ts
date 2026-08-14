import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Slider } from './Slider.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) { for (const k of kids) { const f = findVNode(k, pred); if (f) return f } }
  else if (kids && typeof kids === 'object') return findVNode(kids, pred)
  return null
}

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Slider', () => {
  it('renders range input', async () => {
    const vnode = await renderVNode(Slider, {}, createTestCtx())!
    const input = findVNode(vnode, (v: any) => v?.props?.type === 'range')
    assert.ok(input, 'range input 存在')
  })

  it('renders label when provided', async () => {
    const vnode = await renderVNode(Slider, { label: '温度' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-slider-wrap/)
    const label = vnode.props.children[0]
    assert.equal(label.props.children, '温度')
  })

  it('sets min, max, step', async () => {
    const vnode = await renderVNode(Slider, { min: 0, max: 10, step: 0.5 }, createTestCtx())!
    const input = findVNode(vnode, (v: any) => v?.props?.type === 'range')
    assert.ok(input)
    assert.equal(input.props.min, 0)
    assert.equal(input.props.max, 10)
    assert.equal(input.props.step, 0.5)
  })

  it('displays current value', async () => {
    const vnode = await renderVNode(Slider, { value: 50 }, createTestCtx())!
    const display = findVNode(vnode, (v: any) => v?.props?.class === 'wf-slider-value')
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

it('marks 渲染刻度（含标签）', async () => {
  const vnode = await renderVNode(Slider, {
    value: 0, min: 0, max: 100,
    marks: [{ value: 0, label: '低' }, { value: 50 }, { value: 100, label: '高' }],
  }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-slider-marks'), 'marks 容器存在')
  assert.ok(s.includes('低') && s.includes('高'), 'mark 标签渲染')
  assert.ok(s.includes('mark-0') && s.includes('mark-100'), 'mark key 按值')
})

it('onChangeEnd 拖拽结束回调', async () => {
  let ended: number | undefined
  const vnode = await renderVNode(Slider, { value: 30, onChangeEnd: (v: number) => { ended = v } }, createTestCtx())!
  const input = findVNode(vnode, (v: any) => v?.props?.type === 'range')
  input.props.onPointerUp()
  assert.equal(ended, 30)
})

it('disabled 不显示气泡（无 tip vnode）', async () => {
  const vnode = await renderVNode(Slider, { value: 30, disabled: true }, createTestCtx())!
  assert.ok(!JSON.stringify(vnode).includes('wf-slider-tip'), 'disabled 无 tip')
})

describe('Slider disabled（F2 状态矩阵）', () => {
  it('disabled 时 input 禁用 + 样式类', async () => {
    const vnode = await renderVNode(Slider, { label: '音量', value: 50, disabled: true }, createTestCtx())
    const input = findVNode(vnode, (v: any) => v?.props?.type === 'range')
    assert.ok(input, 'range input 存在')
    assert.equal(input.props.disabled, true, 'disabled 透传原生 input')
    assert.match(String(input.props.class), /--dis/, '禁用样式类')
  })

  it('非 disabled 无禁用样式', async () => {
    const vnode = await renderVNode(Slider, { label: '音量', value: 50 }, createTestCtx())
    const input = findVNode(vnode, (v: any) => v?.props?.type === 'range')
    assert.ok(!input.props.disabled, '非 disabled 无 disabled prop')
  })
})
