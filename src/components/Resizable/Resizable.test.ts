import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Resizable } from './Resizable.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

describe('Resizable', () => {
  it('renders two panels and handle', () => {
    const render = mount(Resizable, { children: ['左', '右'] }, mockCtx())!
    const v = render({ children: ['左', '右'] })
    assert.match(v.props.class, /wf-resizable/)
    assert.equal(v.props.children.length, 3) // panel + handle + panel
  })

  it('horizontal direction class', () => {
    const render = mount(Resizable, { children: ['a', 'b'], direction: 'horizontal' }, mockCtx())!
    const v = render({ children: ['a', 'b'], direction: 'horizontal' })
    assert.match(v.props.class, /wf-resizable--horizontal/)
  })

  it('vertical direction class', () => {
    const render = mount(Resizable, { children: ['a', 'b'], direction: 'vertical' }, mockCtx())!
    const v = render({ children: ['a', 'b'], direction: 'vertical' })
    assert.match(v.props.class, /wf-resizable--vertical/)
  })

  it('applies default size to first panel', () => {
    const render = mount(Resizable, { children: ['a', 'b'], defaultSize: 300 }, mockCtx())!
    const v = render({ children: ['a', 'b'], defaultSize: 300 })
    const first = v.props.children[0]
    assert.equal(first.props.style.flexBasis, '300px')
  })

  it('handle has aria label and keyboard', () => {
    const render = mount(Resizable, { children: ['a', 'b'] }, mockCtx())!
    const v = render({ children: ['a', 'b'] })
    const handle = v.props.children[1]
    assert.equal(handle.props.role, 'separator')
    assert.equal(typeof handle.props.onKeyDown, 'function')
    assert.equal(typeof handle.props.onPointerDown, 'function')
  })

  it('pointer drag resizes and calls onResize', () => {
    let got: number | null = null
    const ctx = mockCtx()
    const render = mount(Resizable, { children: ['a', 'b'], defaultSize: 200, onResize: (s: number) => { got = s } }, ctx)!
    let v = render({ children: ['a', 'b'], defaultSize: 200, onResize: (s: number) => { got = s } })
    const handle = v.props.children[1]
    // pointerdown 在 handle 上
    handle.props.onPointerDown({ clientX: 100, preventDefault: () => {} })
    // 拖动 50px → size = 250
    const ev = new (window as any).Event('pointermove')
    Object.defineProperty(ev, 'clientX', { value: 150 })
    window.dispatchEvent(ev)
    assert.equal(got, 250)
    window.dispatchEvent(new (window as any).Event('pointerup'))
  })

  it('clamps to min/max', () => {
    let got: number | null = null
    const ctx = mockCtx()
    const render = mount(Resizable, { children: ['a', 'b'], defaultSize: 200, min: 100, max: 300, onResize: (s: number) => { got = s } }, ctx)!
    const v = render({ children: ['a', 'b'], defaultSize: 200, min: 100, max: 300, onResize: (s: number) => { got = s } })
    const handle = v.props.children[1]
    handle.props.onPointerDown({ clientX: 100, preventDefault: () => {} })
    const ev = new (window as any).Event('pointermove')
    Object.defineProperty(ev, 'clientX', { value: 400 }) // +300 → clamp 300
    window.dispatchEvent(ev)
    assert.equal(got, 300)
    window.dispatchEvent(new (window as any).Event('pointerup'))
  })

  it('keyboard arrows resize', () => {
    let got: number | null = null
    const ctx = mockCtx()
    const render = mount(Resizable, { children: ['a', 'b'], defaultSize: 200, onResize: (s: number) => { got = s } }, ctx)!
    const v = render({ children: ['a', 'b'], defaultSize: 200, onResize: (s: number) => { got = s } })
    const handle = v.props.children[1]
    handle.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => {} })
    assert.equal(got, 220) // +20
  })
})
