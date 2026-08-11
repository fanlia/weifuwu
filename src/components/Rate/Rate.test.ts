import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Rate } from './Rate.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

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

describe('Rate', () => {
  it('renders count stars (default 5)', () => {
    const vnode = renderVNode(Rate, { value: 3 }, createTestCtx())!
    assert.match(vnode.props.class, /wf-rate/)
    const stars = vnode.props.children
    assert.equal(stars.length, 5)
  })

  it('marks active stars up to value', () => {
    const vnode = renderVNode(Rate, { value: 3 }, createTestCtx())!
    const stars = vnode.props.children
    assert.match(stars[0].props.class, /wf-rate-star--on/)
    assert.match(stars[2].props.class, /wf-rate-star--on/)
    assert.doesNotMatch(stars[3].props.class, /--on/)
  })

  it('renders custom count', () => {
    const vnode = renderVNode(Rate, { value: 1, count: 10 }, createTestCtx())!
    assert.equal(vnode.props.children.length, 10)
  })

  it('calls onChange(3) when clicking 3rd star', () => {
    let got: number | null = null
    const vnode = renderVNode(Rate, { value: 0, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(got, 3)
  })

  it('readOnly: no onChange on click, non-focusable', () => {
    let called = false
    const vnode = renderVNode(Rate, { value: 2, readOnly: true, onChange: () => { called = true } }, createTestCtx())!
    // span（无 onClick），非 button（不可聚焦）
    assert.equal(vnode.props.children[0].props.onClick, undefined)
    assert.equal(vnode.props.children[0].type, 'span')
    assert.equal(called, false)
  })

  it('disabled: no onChange, non-interactive', () => {
    let called = false
    const vnode = renderVNode(Rate, { value: 1, disabled: true, onChange: () => { called = true } }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.onClick, undefined)
    assert.match(vnode.props.class, /wf-rate--disabled/)
    assert.equal(called, false)
  })

  it('keyboard: ArrowRight increases value', () => {
    let got: number | null = null
    const ev = (key: string) => ({ key, preventDefault: () => {} })
    const vnode = renderVNode(Rate, { value: 2, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.onKeyDown(ev('ArrowRight'))
    assert.equal(got, 3)
  })

  it('keyboard: ArrowLeft decreases value', () => {
    let got: number | null = null
    const ev = (key: string) => ({ key, preventDefault: () => {} })
    const vnode = renderVNode(Rate, { value: 2, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.onKeyDown(ev('ArrowLeft'))
    assert.equal(got, 1)
  })

  it('keyboard: Home sets 1, End sets count', () => {
    let got: number | null = null
    const ev = (key: string) => ({ key, preventDefault: () => {} })
    const vnode = renderVNode(Rate, { value: 2, count: 5, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.onKeyDown(ev('Home'))
    assert.equal(got, 1)
    vnode.props.onKeyDown(ev('End'))
    assert.equal(got, 5)
  })

  it('keyboard: clamped at bounds', () => {
    let got: number | null = null
    const ev = (key: string) => ({ key, preventDefault: () => {} })
    const vnode = renderVNode(Rate, { value: 5, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.onKeyDown(ev('ArrowRight'))
    assert.equal(got, 5)
  })

  it('allowClear: clicking current value clears to 0', () => {
    let got: number | null = null
    const vnode = renderVNode(Rate, { value: 3, allowClear: true, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(got, 0)
  })

  it('allowClear off: clicking current value keeps value', () => {
    let got: number | null = null
    const vnode = renderVNode(Rate, { value: 3, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(got, 3)
  })

  it('renders sizes', () => {
    for (const s of ['sm', 'md', 'lg'] as const) {
      const vnode = renderVNode(Rate, { value: 1, size: s }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-rate--${s}`))
    }
  })
})

it('allowHalf：半星渲染 + aria-label', () => {
  const vnode = renderVNode(Rate, { value: 3.5, allowHalf: true, count: 5, readOnly: true }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-rate-star--half'), '半星类')
  assert.ok(s.includes('wf-rate-star-half-fg'), '前景裁剪层')
})

it('allowHalf 无效时不渲染半星', () => {
  const vnode = renderVNode(Rate, { value: 3.5, count: 5, readOnly: true }, createTestCtx())!
  assert.ok(!JSON.stringify(vnode).includes('wf-rate-star--half'), '无 allowHalf 无半星')
})
