import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Slider } from './Slider.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) { for (const k of kids) { const f = findVNode(k, pred); if (f) return f } }
  else if (kids && typeof kids === 'object') return findVNode(kids, pred)
  return null
}

/** Call component and get VNode (two-phase compat) */



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

  it('sets min, max, step（内部归一化 0-100——实际值按比例换算）', async () => {
    const vnode = await renderVNode(Slider, { min: 0, max: 10, step: 0.5 }, createTestCtx())!
    const input = findVNode(vnode, (v: any) => v?.props?.type === 'range')
    assert.ok(input)
    assert.equal(input.props.min, 0)
    assert.equal(input.props.max, 100)
    assert.equal(input.props.step, 5, '内部 step = 实际 step/range*100（0.5/10*100）')
  })

  it('displays current value', async () => {
    const vnode = await renderVNode(Slider, { value: 50 }, createTestCtx())!
    const display = findVNode(vnode, (v: any) => v?.props?.class === 'wf-slider-value')
    assert.equal(display.props.children, '50')
  })
})

it('原生 range 为内部 0-100 刻度（value/min/max/step 全部归一化）', async () => {
  const vnode = await renderVNode(Slider, { value: 5, min: 0, max: 10, step: 1 }, createTestCtx())!
  const input = JSON.stringify(vnode)
  // 内部刻度：value=50（5/10*100）、min=0、max=100、step=10（1/10*100）
  assert.ok(input.includes('"min":0') && input.includes('"max":100') && input.includes('"step":10'))
  assert.ok(input.includes('"value":50'), '内部 value = 实际比例*100（5/10*100=50）')
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

it('onInput 拖拽实时回调（内部 0-100 → 实际值按比例换算——气泡实时跟随回归）', async () => {
  let got: number | undefined
  const vnode = await renderVNode(Slider, { value: 800, min: 0, max: 2000, step: 50, onChange: (v: number) => { got = v } }, createTestCtx())!
  const find = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (n.props?.class === 'wf-slider-input') return n
    const k = n.props?.children
    if (Array.isArray(k)) { for (const c of k) { const f = find(c); if (f) return f } }
    return null
  }
  const input = find(vnode)
  assert.equal(typeof input.props.onInput, 'function', '必须绑 onInput（拖拽实时）')
  assert.equal(input.props.min, 0)
  assert.equal(input.props.max, 100)
  // 内部值 40（= 800/2000*100）→ 实际 800；42.5 → 850（step 50 取整）
  input.props.onInput({ target: { value: '40' } })
  assert.equal(got, 800, '内部 40 → 实际 800')
  input.props.onInput({ target: { value: '42.5' } })
  assert.equal(got, 850, '内部 42.5 → 实际 850（step 取整）')
})

it('轨道渐变边界 = thumb 中心偏移补偿（value=50 → calc 0.5）', async () => {
  const vnode = await renderVNode(Slider, { value: 50, min: 0, max: 100 }, createTestCtx())!
  const s = JSON.stringify(vnode)
  // 渐变边界与 thumb 中心同一公式：calc(9px + (100% - 18px) * 0.5)
  assert.ok(s.includes('calc(9px + (100% - 18px) * 0.5)'), '渐变边界必须含 thumb 偏移补偿')
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
  input.props.onPointerUp({ target: { value: '35' } })
  assert.equal(ended, 35)
})

it('未传 onChangeEnd 时 pointerup 仍存在（拖拽态复位——气泡不残留 bug）', async () => {
  const vnode = await renderVNode(Slider, { value: 30 }, createTestCtx())!
  const input = findVNode(vnode, (v: any) => v?.props?.type === 'range')
  assert.equal(typeof input.props.onPointerUp, 'function', '无 onChangeEnd 也必须绑 pointerup')
  assert.doesNotThrow(() => input.props.onPointerUp({ target: { value: '31' } }))
  assert.equal(typeof input.props.onPointerCancel, 'function', 'pointercancel 兜底存在')
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

describe('Slider range 模式', () => {
  it('range 渲染双滑块（lo/hi input + 区间填充）', async () => {
    const vnode = await renderVNode(Slider, { range: true, value: [20, 80], min: 0, max: 100 }, createTestCtx())!
    const inputs = (() => {
      const out: any[] = []
      const walk = (v: any) => {
        if (!v || typeof v !== 'object') return
        if (v?.props?.type === 'range') out.push(v)
        const kids = v.props?.children
        if (Array.isArray(kids)) kids.forEach(walk)
        else if (kids && typeof kids === 'object') walk(kids)
      }
      walk(vnode)
      return out
    })()
    assert.equal(inputs.length, 2, '双 input')
    assert.ok(inputs[0].props.class.includes('wf-slider-input--lo'))
    assert.ok(inputs[1].props.class.includes('wf-slider-input--hi'))
    assert.equal(inputs[0].props.value, 20, 'lo 内部刻度 20')
    assert.equal(inputs[1].props.value, 80, 'hi 内部刻度 80')
  })

  it('range 显示区间值 lo - hi', async () => {
    const vnode = await renderVNode(Slider, { range: true, value: [30, 70] }, createTestCtx())!
    const display = findVNode(vnode, (v: any) => v?.props?.class === 'wf-slider-value')
    assert.equal(display.props.children, '30 - 70')
  })

  it('range 传反自动纠正（[80, 20] → lo=20 hi=80）', async () => {
    const vnode = await renderVNode(Slider, { range: true, value: [80, 20] }, createTestCtx())!
    const inputs: any[] = []
    const walk = (v: any) => {
      if (!v || typeof v !== 'object') return
      if (v?.props?.type === 'range') inputs.push(v)
      const kids = v.props?.children
      if (Array.isArray(kids)) kids.forEach(walk)
      else if (kids && typeof kids === 'object') walk(kids)
    }
    walk(vnode)
    assert.equal(inputs[0].props.value, 20, 'lo=20')
    assert.equal(inputs[1].props.value, 80, 'hi=80')
  })

  it('range 区间填充：left=lo 偏移、width=区间比例', async () => {
    const vnode = await renderVNode(Slider, { range: true, value: [25, 75], min: 0, max: 100 }, createTestCtx())!
    const fill = findVNode(vnode, (v: any) => v?.props?.class === 'wf-slider-range-fill')
    assert.ok(fill, '填充层存在')
    assert.match(fill.props.style.left, /\* 0.25/, 'left = lo 偏移')
    assert.match(fill.props.style.width, /\* 0.5/, 'width = (hi-lo)/100')
  })

  it('range 单值回调不受影响（onChange 不随 range 触发——类型隔离）', async () => {
    const calls: any[] = []
    const ctx = createTestCtx()
    const vnode = await renderVNode(Slider, { range: true, value: [10, 90], onRangeChange: (v) => calls.push(v), onChange: () => calls.push('single') }, ctx)!
    const inputs: any[] = []
    const walk = (v: any) => {
      if (!v || typeof v !== 'object') return
      if (v?.props?.type === 'range') inputs.push(v)
      const kids = v.props?.children
      if (Array.isArray(kids)) kids.forEach(walk)
      else if (kids && typeof kids === 'object') walk(kids)
    }
    walk(vnode)
    // 触发 lo input 的 onInput（内部 0-100 刻度 10 → 20）
    inputs[0].props.onInput({ target: { value: 20 } })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], [20, 90], 'onRangeChange 收到 [lo, hi]')
  })

  it('range clamp：lo 不超过 hi - step（防交叉）', async () => {
    const calls: any[] = []
    const vnode = await renderVNode(Slider, { range: true, value: [40, 60], step: 10, onRangeChange: (v) => calls.push(v) }, createTestCtx())!
    const inputs: any[] = []
    const walk = (v: any) => {
      if (!v || typeof v !== 'object') return
      if (v?.props?.type === 'range') inputs.push(v)
      const kids = v.props?.children
      if (Array.isArray(kids)) kids.forEach(walk)
      else if (kids && typeof kids === 'object') walk(kids)
    }
    walk(vnode)
    // lo 拖到 70（超过 hi-10=50）→ clamp 到 50
    inputs[0].props.onInput({ target: { value: 70 } })
    assert.deepEqual(calls[0], [50, 60], 'lo 被 clamp 到 hi-step')
  })
})
