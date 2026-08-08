import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PinInput } from './PinInput.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('PinInput', () => {
  it('renders length inputs (default 6)', () => {
    const vnode = renderVNode(PinInput, { value: '' }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-pin-input/)
    assert.equal(vnode.props.children.length, 6)
    assert.equal(vnode.props.children[0].type, 'input')
  })

  it('distributes value chars across cells', () => {
    const vnode = renderVNode(PinInput, { length: 4, value: '12x4' }, mockCtx())!
    const cells = vnode.props.children
    assert.equal(cells[0].props.value, '1')
    assert.equal(cells[1].props.value, '2')
    assert.equal(cells[2].props.value, 'x')
    assert.equal(cells[3].props.value, '4')
  })

  it('typing in cell builds full value', () => {
    let got = ''
    const vnode = renderVNode(PinInput, { length: 4, value: '12', onChange: (v: string) => { got = v } }, mockCtx())!
    const cells = vnode.props.children
    // 第 3 格输入 '9'
    cells[2].props.onInput({ target: { value: '9' } } as any)
    assert.equal(got, '129')
  })

  it('ignores non-numeric input in number mode', () => {
    let got = '12'
    const vnode = renderVNode(PinInput, { length: 4, value: '12', type: 'number', onChange: (v: string) => { got = v } }, mockCtx())!
    vnode.props.children[2].props.onInput({ target: { value: 'a' } } as any)
    assert.equal(got, '12') // 数字模式拒绝字母
  })

  it('backspace clears current cell', () => {
    let got = '123'
    const vnode = renderVNode(PinInput, { length: 4, value: '123', onChange: (v: string) => { got = v } }, mockCtx())!
    const ev = { key: 'Backspace', preventDefault: () => {} }
    // 第 4 格有值 → 清除
    vnode.props.children[3].props.onKeyDown(ev)
    assert.equal(got, '123') // 第 4 格已空（value 长度 3），无变化
    vnode.props.children[2].props.onKeyDown(ev)
    assert.equal(got, '12')
  })

  it('paste distributes full string', () => {
    let got = ''
    const vnode = renderVNode(PinInput, { length: 6, value: '', onChange: (v: string) => { got = v } }, mockCtx())!
    const ev = { clipboardData: { getData: () => '483920' }, preventDefault: () => {} }
    vnode.props.children[0].props.onPaste(ev)
    assert.equal(got, '483920')
  })

  it('paste clamps to length', () => {
    let got = ''
    const vnode = renderVNode(PinInput, { length: 4, value: '', onChange: (v: string) => { got = v } }, mockCtx())!
    const ev = { clipboardData: { getData: () => '123456' }, preventDefault: () => {} }
    vnode.props.children[0].props.onPaste(ev)
    assert.equal(got, '1234')
  })

  it('disabled renders disabled inputs', () => {
    const vnode = renderVNode(PinInput, { length: 4, value: '', disabled: true }, mockCtx())!
    assert.equal(vnode.props.children[0].props.disabled, true)
  })

  it('number mode sets inputMode numeric', () => {
    const vnode = renderVNode(PinInput, { length: 4, value: '', type: 'number' }, mockCtx())!
    assert.equal(vnode.props.children[0].props.inputMode, 'numeric')
  })
})
