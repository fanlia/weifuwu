import { describe, it } from 'node:test'
import assert from 'node:assert'
import { CheckboxGroup } from './CheckboxGroup.ts'
import { Checkbox } from '../Checkbox/Checkbox.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  const uncontrolled = new Map<string, any>()
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    useControlled: (opts: any) => {
      const controlled = opts.value !== undefined
      const key = opts.name ?? 'default'
      if (!uncontrolled.has(key)) uncontrolled.set(key, opts.value)
      const setValue = (v: any) => {
        if (controlled) opts.onChange?.(v)
        else uncontrolled.set(key, v)
      }
      return { value: controlled ? opts.value : uncontrolled.get(key), setValue, controlled }
    },
  } } as any
}

const opts = [
  { value: 'a', label: '选项A' },
  { value: 'b', label: '选项B' },
  { value: 'c', label: '选项C', desc: '带描述' },
]

describe('CheckboxGroup', () => {
  it('renders one Checkbox per option', () => {
    const vnode = renderVNode(CheckboxGroup, { options: opts, value: [] }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-checkbox-group/)
    assert.equal(vnode.props.children.length, 3)
    assert.equal(vnode.props.children[0].type, Checkbox) // 子项是 Checkbox 组件 VNode
  })

  it('marks selected options checked', () => {
    const vnode = renderVNode(CheckboxGroup, { options: opts, value: ['a', 'c'] }, mockCtx())!
    assert.equal(vnode.props.children[0].props.checked, true)
    assert.equal(vnode.props.children[1].props.checked, false)
    assert.equal(vnode.props.children[2].props.checked, true)
  })

  it('toggle adds value', () => {
    let got: string[] = []
    const vnode = renderVNode(CheckboxGroup, { options: opts, value: ['a'], onChange: (v: string[]) => { got = v } }, mockCtx())!
    vnode.props.children[1].props.onChange(true) // b
    assert.deepEqual(got, ['a', 'b'])
  })

  it('toggle removes value', () => {
    let got: string[] = []
    const vnode = renderVNode(CheckboxGroup, { options: opts, value: ['a', 'b'], onChange: (v: string[]) => { got = v } }, mockCtx())!
    vnode.props.children[0].props.onChange(false) // a
    assert.deepEqual(got, ['b'])
  })

  it('applies columns class', () => {
    const vnode = renderVNode(CheckboxGroup, { options: opts, value: [], columns: 2 }, mockCtx())!
    assert.match(vnode.props.class, /wf-checkbox-group--cols-2/)
  })

  it('disabled propagates to options', () => {
    const vnode = renderVNode(CheckboxGroup, { options: opts, value: [], disabled: true }, mockCtx())!
    assert.equal(vnode.props.children[0].props.disabled, true)
  })

  it('option-level disabled wins', () => {
    const vnode = renderVNode(CheckboxGroup, {
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }],
      value: [], disabled: false,
    }, mockCtx())!
    assert.equal(vnode.props.children[1].props.disabled, true)
    assert.notEqual(vnode.props.children[0].props.disabled, true) // undefined = 非禁用
  })

  it('renders group label when provided', () => {
    const vnode = renderVNode(CheckboxGroup, { options: opts, value: [], label: '选择成员' }, mockCtx())!
    // 第一个 children 是 label div，其 children 是字符串
    assert.equal(vnode.props.children[0].props.children, '选择成员')
  })
})
