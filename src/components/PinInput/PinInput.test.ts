import { describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert'
import { PinInput } from './PinInput.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'
import { setupJsdom } from '../../test/client/setup.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { h } from '../../ui-dom/vnode.ts'
import { mountRoot } from '../../ui-dom/vdom/mount.ts'

before(setupJsdom)
afterEach(() => { createClientBrowser().clearBody() })

/** Call component and get VNode (two-phase compat) */

const flush = () => new Promise((r) => setTimeout(r, 30))


describe('PinInput', () => {
  it('renders length inputs (default 6)', async () => {
    const vnode = await renderVNode(PinInput, { value: '' }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-pin-input/)
    assert.equal(vnode.props.children.length, 6)
    assert.equal(vnode.props.children[0].type, 'input')
  })

  it('distributes value chars across cells', async () => {
    const vnode = await renderVNode(PinInput, { length: 4, value: '12x4' }, createTestCtx())!
    const cells = vnode.props.children
    assert.equal(cells[0].props.value, '1')
    assert.equal(cells[1].props.value, '2')
    assert.equal(cells[2].props.value, 'x')
    assert.equal(cells[3].props.value, '4')
  })

  it('typing in cell builds full value', async () => {
    let got = ''
    const vnode = await renderVNode(PinInput, { length: 4, value: '12', onChange: (v: string) => { got = v } }, createTestCtx())!
    const cells = vnode.props.children
    // 第 3 格输入 '9'
    cells[2].props.onInput({ target: { value: '9' } } as any)
    assert.equal(got, '129')
  })

  it('ignores non-numeric input in number mode', async () => {
    let got = '12'
    const vnode = await renderVNode(PinInput, { length: 4, value: '12', type: 'number', onChange: (v: string) => { got = v } }, createTestCtx())!
    vnode.props.children[2].props.onInput({ target: { value: 'a' } } as any)
    assert.equal(got, '12') // 数字模式拒绝字母
  })

  it('backspace clears current cell', async () => {
    let got = '123'
    const vnode = await renderVNode(PinInput, { length: 4, value: '123', onChange: (v: string) => { got = v } }, createTestCtx())!
    const ev = { key: 'Backspace', preventDefault: () => {} }
    // 第 4 格有值 → 清除
    vnode.props.children[3].props.onKeyDown(ev)
    assert.equal(got, '123') // 第 4 格已空（value 长度 3），无变化
    vnode.props.children[2].props.onKeyDown(ev)
    assert.equal(got, '12')
  })

  it('paste distributes full string', async () => {
    let got = ''
    const vnode = await renderVNode(PinInput, { length: 6, value: '', onChange: (v: string) => { got = v } }, createTestCtx())!
    const ev = { clipboardData: { getData: () => '483920' }, preventDefault: () => {} }
    vnode.props.children[0].props.onPaste(ev)
    assert.equal(got, '483920')
  })

  it('paste clamps to length', async () => {
    let got = ''
    const vnode = await renderVNode(PinInput, { length: 4, value: '', onChange: (v: string) => { got = v } }, createTestCtx())!
    const ev = { clipboardData: { getData: () => '123456' }, preventDefault: () => {} }
    vnode.props.children[0].props.onPaste(ev)
    assert.equal(got, '1234')
  })

  it('disabled renders disabled inputs', async () => {
    const vnode = await renderVNode(PinInput, { length: 4, value: '', disabled: true }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.disabled, true)
  })

  it('number mode sets inputMode numeric', async () => {
    const vnode = await renderVNode(PinInput, { length: 4, value: '', type: 'number' }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.inputMode, 'numeric')
  })

  // 回归：自动跳框依赖 refs 填充——ref 闭包捕获索引（不读 dataset——根治
  // data-idx 依赖 setProp 顺序的隐式契约；此前 ref 读 el.dataset.idx 时若
  // data-idx prop 在后（Object.entries 插入序）读到 undefined → refs 不填充
  // → focusCell 找不到元素 → 输入后不跳下一格（真实 bug，jsdom 实测）
  it('DOM: 输入后自动聚焦下一格（闭包捕获索引回归）', async () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    let v = ''
    const Demo = async (_init: any, ctx: any) => () =>
      h('div', {}, h(PinInput, { length: 6, value: v, onChange: (s: string) => { v = s; ctx.ui.render() } }))
    const handle = mountRoot({ root, browser: createClientBrowser() })
    await handle.mount(h('div', {}, h(Demo, {})))
    await flush()

    const cells = [...root.querySelectorAll('.wf-pin-input-cell')]
    assert.equal(cells.length, 6)
    cells[0].focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    setter.call(cells[0], '4')
    cells[0].dispatchEvent(new (window as any).InputEvent('input', { bubbles: true, data: '4' }))
    await flush()
    await flush()
    // data-idx 已删除（闭包捕获方案）——断言焦点元素是第 2 个 input
    const active = document.activeElement as HTMLElement
    assert.equal(active, root.querySelectorAll('.wf-pin-input-cell')[1], '输入后焦点跳到第 2 格')
    assert.equal(v, '4', '值已回传')
    handle.unmount()
  })
})
