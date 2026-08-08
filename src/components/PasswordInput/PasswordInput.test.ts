import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PasswordInput } from './PasswordInput.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}
function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}
function findInput(v: any): any {
  if (v?.props?.type === 'password' || v?.props?.type === 'text') return v
  if (Array.isArray(v?.props?.children)) {
    for (const c of v.props.children) { const r = findInput(c); if (r) return r }
  }
  return null
}
function findEye(v: any): any {
  if (v?.props?.['aria-label'] === '显示密码' || v?.props?.['aria-label'] === '隐藏密码') return v
  if (Array.isArray(v?.props?.children)) {
    for (const c of v.props.children) { const r = findEye(c); if (r) return r }
  }
  return null
}

describe('PasswordInput', () => {
  it('默认 type=password', () => {
    const vnode = renderVNode(PasswordInput, { value: 'secret' }, mockCtx())!
    assert.equal(findInput(vnode).props.type, 'password')
  })

  it('点击眼睛 → type=text（可见）+ aria-label 切换', () => {
    const ctx = mockCtx()
    const inner = PasswordInput({}, ctx) // mount 一次，闭包状态保持
    let vnode = inner({ value: 'secret' })
    let eye = findEye(vnode)
    assert.ok(eye, '眼睛按钮存在')
    assert.equal(eye.props['aria-label'], '显示密码')
    eye.props.onClick() // toggle → ctx.ui.render()（mock 空）→ 重新 render 拿新状态
    vnode = inner({ value: 'secret' })
    eye = findEye(vnode)
    assert.equal(findInput(vnode).props.type, 'text')
    assert.equal(eye.props['aria-label'], '隐藏密码')
  })

  it('再点眼睛 → 恢复 password', () => {
    const ctx = mockCtx()
    const inner = PasswordInput({}, ctx)
    let vnode = inner({ value: 'x' })
    findEye(vnode).props.onClick()
    vnode = inner({ value: 'x' })
    findEye(vnode).props.onClick()
    vnode = inner({ value: 'x' })
    assert.equal(findInput(vnode).props.type, 'password')
  })

  it('value 透传输入框', () => {
    const vnode = renderVNode(PasswordInput, { value: 'abc', label: '密码' }, mockCtx())!
    assert.equal(findInput(vnode).props.value, 'abc')
  })
})
