import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PasswordInput } from './PasswordInput.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

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
  it('默认 type=password', async () => {
    const vnode = await renderVNode(PasswordInput, { value: 'secret' }, createTestCtx())!
    assert.equal(findInput(vnode).props.type, 'password')
  })

  it('点击眼睛 → type=text（可见）+ aria-label 切换', async () => {
    const ctx = createTestCtx()
    const inner = await PasswordInput({}, ctx) // mount 一次，闭包状态保持
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

  it('再点眼睛 → 恢复 password', async () => {
    const ctx = createTestCtx()
    const inner = await PasswordInput({}, ctx)
    let vnode = inner({ value: 'x' })
    findEye(vnode).props.onClick()
    vnode = inner({ value: 'x' })
    findEye(vnode).props.onClick()
    vnode = inner({ value: 'x' })
    assert.equal(findInput(vnode).props.type, 'password')
  })

  it('value 透传输入框', async () => {
    const vnode = await renderVNode(PasswordInput, { value: 'abc', label: '密码' }, createTestCtx())!
    assert.equal(findInput(vnode).props.value, 'abc')
  })
})

it('默认 type=password', async () => {
  const vnode = await renderVNode(PasswordInput, {}, createTestCtx())!
  assert.equal(findInput(vnode).props.type, 'password')
})

it('点击眼睛切换可见性（password → text）', async () => {
  const ctx = createTestCtx()
  const factory = await PasswordInput({}, ctx)
  let vnode = factory({})
  assert.equal(findInput(vnode).props.type, 'password')
  const findToggle = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (/toggle|eye/.test(String(n.props?.class ?? '')) && n.props?.onClick) return n
    const k = n.props?.children
    if (Array.isArray(k)) for (const c of k) { const f = findToggle(c); if (f) return f }
    return null
  }
  findToggle(vnode).props.onClick()
  vnode = factory({})
  assert.equal(findInput(vnode).props.type, 'text', '切换后明文')
})

it('disabled 时切换无效', async () => {
  const ctx = createTestCtx()
  const factory = await PasswordInput({}, ctx)
  let vnode = factory({ disabled: true })
  const findToggle = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (/toggle|eye/.test(String(n.props?.class ?? '')) && n.props?.onClick) return n
    const k = n.props?.children
    if (Array.isArray(k)) for (const c of k) { const f = findToggle(c); if (f) return f }
    return null
  }
  const t = findToggle(vnode)
  if (t) t.props.onClick()
  vnode = factory({ disabled: true })
  assert.equal(findInput(vnode).props.type, 'password', 'disabled 不切换')
})

it('error/hint 展示', async () => {
  const vnode = await renderVNode(PasswordInput, { error: '太短', hint: undefined }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('太短'))
})
