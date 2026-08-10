import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { InputNumber } from './InputNumber.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

/** 从组件树找控件元素 */
function findInput(v: any): any {
  if (v?.props?.class === 'wf-inputnumber-input') return v
  if (Array.isArray(v?.props?.children)) {
    for (const c of v.props.children) {
      const r = findInput(c)
      if (r) return r
    }
  }
  return null
}
function findBtn(v: any, aria: string): any {
  if (v?.props?.['aria-label'] === aria) return v
  if (Array.isArray(v?.props?.children)) {
    for (const c of v.props.children) {
      const r = findBtn(c, aria)
      if (r) return r
    }
  }
  return null
}

describe('InputNumber', () => {
  it('渲染输入框 + 增减按钮', () => {
    const vnode = renderVNode(InputNumber, { value: 5 }, mockCtx())!
    const input = findInput(vnode)
    assert.ok(input)
    assert.equal(input.props.value, '5')
    assert.ok(findBtn(vnode, '增加'))
    assert.ok(findBtn(vnode, '减少'))
  })

  it('点击 + → onChange(n+step)', () => {
    let val: number | null = 0
    const vnode = renderVNode(InputNumber, { value: 5, onChange: (n: number | null) => { val = n } }, mockCtx())!
    findBtn(vnode, '增加').props.onClick()
    assert.equal(val, 6)
  })

  it('点击 - → onChange(n-step)，不低于 min', () => {
    let val: number | null = 0
    const vnode = renderVNode(InputNumber, { value: 2, min: 1, onChange: (n: number | null) => { val = n } }, mockCtx())!
    findBtn(vnode, '减少').props.onClick()
    assert.equal(val, 1)
    findBtn(vnode, '减少').props.onClick() // 已在 min，不再减
    assert.equal(val, 1)
  })

  it('输入数字 → onChange', () => {
    let val: number | null = null
    const vnode = renderVNode(InputNumber, { value: 1, onChange: (n: number | null) => { val = n } }, mockCtx())!
    const input = findInput(vnode)
    input.props.onInput({ target: { value: '42' } })
    assert.equal(val, 42)
  })

  it('输入空 → onChange(null)', () => {
    let val: number | null = 1
    const vnode = renderVNode(InputNumber, { value: 1, onChange: (n: number | null) => { val = n } }, mockCtx())!
    findInput(vnode).props.onInput({ target: { value: '' } })
    assert.equal(val, null)
  })

  it('输入非法字符 → 忽略（保持原值）', () => {
    let val: number | null = 3
    const vnode = renderVNode(InputNumber, { value: 3, onChange: (n: number | null) => { val = n } }, mockCtx())!
    findInput(vnode).props.onInput({ target: { value: 'abc' } })
    assert.equal(val, 3)
  })

  it('输入 999 超 max → 即时 clamp 到 10', () => {
    let val: number | null = 0
    const vnode = renderVNode(InputNumber, { value: 1, min: 0, max: 10, onChange: (n: number | null) => { val = n } }, mockCtx())!
    findInput(vnode).props.onInput({ target: { value: '999' } })
    assert.equal(val, 10)
  })

  it('失焦安全网：受控值越界时 clamp（父组件未同步时兜底）', () => {
    let val: number | null = 99 // 模拟父组件存了越界值
    const vnode = renderVNode(InputNumber, { value: 99, min: 0, max: 10, onChange: (n: number | null) => { val = n } }, mockCtx())!
    findInput(vnode).props.onBlur()
    assert.equal(val, 10)
  })

  it('disabled 时按钮不可点', () => {
    let clicked = false
    const vnode = renderVNode(InputNumber, { value: 5, disabled: true, onChange: () => { clicked = true } }, mockCtx())!
    findBtn(vnode, '增加').props.onClick()
    assert.equal(clicked, false)
  })
})
