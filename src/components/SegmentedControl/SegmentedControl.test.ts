import { describe, it } from 'node:test'
import assert from 'node:assert'
import { SegmentedControl } from './SegmentedControl.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'


function createTestCtx(): WfuiContext {
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

const options = [
  { value: 'ai', label: 'AI 生成' },
  { value: 'manual', label: '手动编写' },
  { value: 'template', label: '模板', disabled: true },
]

describe('SegmentedControl', () => {
  it('renders a group with one button per option', () => {
    const vnode = renderVNode(SegmentedControl, { options }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-segmented/)
    assert.equal(vnode.props.role, 'group')
    assert.equal(vnode.props.children.length, 3)
  })

  it('marks the active option with aria-pressed and class', () => {
    const vnode = renderVNode(SegmentedControl, { options, value: 'ai' }, createTestCtx())!
    const [ai, manual] = vnode.props.children
    assert.match(ai.props.class, /wf-segmented-option--active/)
    assert.equal(ai.props['aria-pressed'], 'true')
    assert.equal(manual.props['aria-pressed'], 'false')
  })

  it('fires onChange with the clicked value', () => {
    let got: string | undefined
    const vnode = renderVNode(SegmentedControl, { options, value: 'ai', onChange: (v: string) => { got = v } }, createTestCtx())!
    vnode.props.children[1].props.onClick()
    assert.equal(got, 'manual')
  })

  it('disabled options do not fire onChange', () => {
    let fired = false
    const vnode = renderVNode(SegmentedControl, { options, onChange: () => { fired = true } }, createTestCtx())!
    assert.equal(vnode.props.children[2].props.disabled, true)
    assert.equal(vnode.props.children[2].props.onClick, undefined, 'disabled option should not bind onClick')
    vnode.props.children[0].props.onClick()
    assert.equal(fired, true, 'enabled option still fires')
  })

  it('applies size and block classes', () => {
    const sm = renderVNode(SegmentedControl, { options, size: 'sm' }, createTestCtx())!
    const block = renderVNode(SegmentedControl, { options, block: true }, createTestCtx())!
    assert.match(sm.props.class, /wf-segmented--sm/)
    assert.match(block.props.class, /wf-segmented--block/)
  })
})

it('受控 value：点击通知 onChange（父层独占选中）', () => {
  let got: string | undefined
  const options = [{ value: '7d', label: '近7天' }, { value: '30d', label: '近30天' }]
  const vnode = renderVNode(SegmentedControl, { options, value: '7d', onChange: (v: string) => { got = v } }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('近30天'))
  const find = (n: any): any[] => {
    const out: any[] = []
    const walk = (x: any) => {
      if (!x || typeof x !== 'object') return
      if (x.props?.onClick && /segment/i.test(String(x.props?.class ?? ''))) out.push(x)
      const k = x.props?.children
      if (Array.isArray(k)) k.forEach(walk)
    }
    walk(n)
    return out
  }
  find(vnode)[1].props.onClick()
  assert.equal(got, '30d')
})

it('size=sm + block 变体类', () => {
  const options = [{ value: 'a', label: 'A' }]
  const vnode = renderVNode(SegmentedControl, { options, size: 'sm', block: true }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('sm') && s.includes('block'))
})

it('空 options 不抛错（边界）', () => {
  const vnode = renderVNode(SegmentedControl, { options: [] }, createTestCtx())!
  assert.ok(vnode)
})
