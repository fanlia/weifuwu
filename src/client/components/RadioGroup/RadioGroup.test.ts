import { describe, it } from 'node:test'
import assert from 'node:assert'
import { RadioGroup } from './RadioGroup.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx as officialCreateTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */


function createTestCtx(overrides?: Record<string, unknown>): UIContext {
  // 官方测试 ctx（vdom/testing——render/ui hooks mock——组件消费面）
  return officialCreateTestCtx(overrides as never)
}


describe('RadioGroup', () => {
  const options = [
    { value: 'a', label: '选项A' },
    { value: 'b', label: '选项B' },
  ]

  it('renders radio options', async () => {
    const vnode = await renderVNode(RadioGroup, { options }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-radio-group/)
    assert.equal(vnode.props.children.length, 2)
  })

  it('renders label text for each option', async () => {
    const vnode = await renderVNode(RadioGroup, { options }, createTestCtx())!
    const firstLabel = vnode.props.children[0].props.children[2]
    assert.equal(firstLabel.props.children, '选项A')
  })

  it('sets checked state based on value', async () => {
    const vnode = await renderVNode(RadioGroup, { options, value: 'b' }, createTestCtx())!
    const inputs = vnode.props.children.map((c: any) => c.props.children[0])
    assert.equal(inputs[0].props.checked, undefined)
    assert.equal(inputs[1].props.checked, true)
  })

  it('renders inline class when inline prop is set', async () => {
    const vnode = await renderVNode(RadioGroup, { options, inline: true }, createTestCtx())!
    assert.match(vnode.props.class, /wf-radio-group--inline/)
  })
})

it('受控 value：点击通知 onChange（父层独占）', async () => {
  let got: string | undefined
  const options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
  const vnode = await renderVNode(RadioGroup, { options, value: 'a', onChange: (v: string) => { got = v } }, createTestCtx())!
  const inputB = vnode.props.children[1].props.children[0]
  inputB.props.onChange()
  assert.equal(got, 'b', '受控模式点击 B 通知 onChange(b)')
})

it('非受控：选择经 useControlled 内部态（onChange 仍通知）', async () => {
  let got: string | undefined
  const options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]
  const ctx = createTestCtx()
  const factory = await RadioGroup({}, ctx)
  factory({ options, onChange: (v: string) => { got = v } })
  const vnode = await factory({ options, onChange: (v: string) => { got = v } })
  vnode.props.children[1].props.children[0].props.onChange()
  assert.equal(got, 'b')
})

it('option disabled 传递到 input', async () => {
  const options = [{ value: 'a', label: 'A', disabled: true }]
  const vnode = await renderVNode(RadioGroup, { options }, createTestCtx())!
  assert.ok(vnode.props.children[0].props.children[0].props.disabled)
})

it('inline 布局类', async () => {
  const options = [{ value: 'a', label: 'A' }]
  const vnode = await renderVNode(RadioGroup, { options, inline: true }, createTestCtx())!
  assert.match(vnode.props.class, /inline/)
})

it('name 透传（表单提交组名）', async () => {
  const options = [{ value: 'a', label: 'A' }]
  const vnode = await renderVNode(RadioGroup, { name: 'role', options }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('"name":"role"'), 'name 透传到 radio input')
})
