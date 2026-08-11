import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PinInput } from './PinInput.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('PinInput', () => {
  it('renders length inputs (default 6)', () => {
    const vnode = renderVNode(PinInput, { value: '' }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-pin-input/)
    assert.equal(vnode.props.children.length, 6)
    assert.equal(vnode.props.children[0].type, 'input')
  })

  it('distributes value chars across cells', () => {
    const vnode = renderVNode(PinInput, { length: 4, value: '12x4' }, createTestCtx())!
    const cells = vnode.props.children
    assert.equal(cells[0].props.value, '1')
    assert.equal(cells[1].props.value, '2')
    assert.equal(cells[2].props.value, 'x')
    assert.equal(cells[3].props.value, '4')
  })

  it('typing in cell builds full value', () => {
    let got = ''
    const vnode = renderVNode(PinInput, { length: 4, value: '12', onChange: (v: string) => { got = v } }, createTestCtx())!
    const cells = vnode.props.children
    // 第 3 格输入 '9'
    cells[2].props.onInput({ target: { value: '9' } } as any)
    assert.equal(got, '129')
  })

  it('ignores non-numeric input in number mode', () => {
    let got = '12'
    const vnode = renderVNode(PinInput, { length: 4, value: '12', type: 'number', onChange: (v: string) => { got = v } }, createTestCtx())!
    vnode.props.children[2].props.onInput({ target: { value: 'a' } } as any)
    assert.equal(got, '12') // 数字模式拒绝字母
  })

  it('backspace clears current cell', () => {
    let got = '123'
    const vnode = renderVNode(PinInput, { length: 4, value: '123', onChange: (v: string) => { got = v } }, createTestCtx())!
    const ev = { key: 'Backspace', preventDefault: () => {} }
    // 第 4 格有值 → 清除
    vnode.props.children[3].props.onKeyDown(ev)
    assert.equal(got, '123') // 第 4 格已空（value 长度 3），无变化
    vnode.props.children[2].props.onKeyDown(ev)
    assert.equal(got, '12')
  })

  it('paste distributes full string', () => {
    let got = ''
    const vnode = renderVNode(PinInput, { length: 6, value: '', onChange: (v: string) => { got = v } }, createTestCtx())!
    const ev = { clipboardData: { getData: () => '483920' }, preventDefault: () => {} }
    vnode.props.children[0].props.onPaste(ev)
    assert.equal(got, '483920')
  })

  it('paste clamps to length', () => {
    let got = ''
    const vnode = renderVNode(PinInput, { length: 4, value: '', onChange: (v: string) => { got = v } }, createTestCtx())!
    const ev = { clipboardData: { getData: () => '123456' }, preventDefault: () => {} }
    vnode.props.children[0].props.onPaste(ev)
    assert.equal(got, '1234')
  })

  it('disabled renders disabled inputs', () => {
    const vnode = renderVNode(PinInput, { length: 4, value: '', disabled: true }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.disabled, true)
  })

  it('number mode sets inputMode numeric', () => {
    const vnode = renderVNode(PinInput, { length: 4, value: '', type: 'number' }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.inputMode, 'numeric')
  })
})
