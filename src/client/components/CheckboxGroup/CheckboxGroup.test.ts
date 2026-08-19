import { describe, it } from 'node:test'
import assert from 'node:assert'
import { CheckboxGroup } from './CheckboxGroup.ts'
import { Checkbox } from '../Checkbox/Checkbox.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx as officialCreateTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */


function createTestCtx(overrides?: Record<string, unknown>): UIContext {
  // 官方测试 ctx（vdom/testing——render/ui hooks mock——组件消费面）
  return officialCreateTestCtx(overrides as never)
}


const opts = [
  { value: 'a', label: '选项A' },
  { value: 'b', label: '选项B' },
  { value: 'c', label: '选项C', desc: '带描述' },
]

describe('CheckboxGroup', () => {
  it('renders one Checkbox per option', async () => {
    const vnode = await renderVNode(CheckboxGroup, { options: opts, value: [] }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-checkbox-group/)
    assert.equal(vnode.props.children.length, 3)
    assert.equal(vnode.props.children[0].type, Checkbox) // 子项是 Checkbox 组件 VNode
  })

  it('marks selected options checked', async () => {
    const vnode = await renderVNode(CheckboxGroup, { options: opts, value: ['a', 'c'] }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.checked, true)
    assert.equal(vnode.props.children[1].props.checked, false)
    assert.equal(vnode.props.children[2].props.checked, true)
  })

  it('toggle adds value', async () => {
    let got: string[] = []
    const vnode = await renderVNode(CheckboxGroup, { options: opts, value: ['a'], onChange: (v: string[]) => { got = v } }, createTestCtx())!
    vnode.props.children[1].props.onChange(true) // b
    assert.deepEqual(got, ['a', 'b'])
  })

  it('toggle removes value', async () => {
    let got: string[] = []
    const vnode = await renderVNode(CheckboxGroup, { options: opts, value: ['a', 'b'], onChange: (v: string[]) => { got = v } }, createTestCtx())!
    vnode.props.children[0].props.onChange(false) // a
    assert.deepEqual(got, ['b'])
  })

  it('applies columns class', async () => {
    const vnode = await renderVNode(CheckboxGroup, { options: opts, value: [], columns: 2 }, createTestCtx())!
    assert.match(vnode.props.class, /wf-checkbox-group--cols-2/)
  })

  it('disabled propagates to options', async () => {
    const vnode = await renderVNode(CheckboxGroup, { options: opts, value: [], disabled: true }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.disabled, true)
  })

  it('option-level disabled wins', async () => {
    const vnode = await renderVNode(CheckboxGroup, {
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }],
      value: [], disabled: false,
    }, createTestCtx())!
    assert.equal(vnode.props.children[1].props.disabled, true)
    assert.notEqual(vnode.props.children[0].props.disabled, true) // undefined = 非禁用
  })

  it('renders group label when provided', async () => {
    const vnode = await renderVNode(CheckboxGroup, { options: opts, value: [], label: '选择成员' }, createTestCtx())!
    // 第一个 children 是 label div，其 children 是字符串
    assert.equal(vnode.props.children[0].props.children, '选择成员')
  })
})
