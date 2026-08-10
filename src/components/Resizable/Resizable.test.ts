import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Resizable } from './Resizable.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

function mockCtx(): WfuiContext {
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    // useDrag mock：onPointerDown 透传（拖拽逻辑由 useDrag 单测覆盖，组件层测结构）
    useDrag: (opts: any) => ({ onPointerDown: (e: any) => { opts.onStart?.(e) } }),
  } } as any
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

  it('handle spreads useDrag onPointerDown（拖拽由 useDrag 单测覆盖）', () => {
    const ctx = mockCtx()
    const render = mount(Resizable, { children: ['a', 'b'], defaultSize: 200 }, ctx)!
    const v = render({ children: ['a', 'b'], defaultSize: 200 })
    const handle = v.props.children[1]
    assert.equal(typeof handle.props.onPointerDown, 'function', 'onPointerDown 来自 useDrag spread')
  })

  it('clamps to min/max（键盘路径仍生效）', () => {
    let got: number | null = null
    const ctx = mockCtx()
    const render = mount(Resizable, { children: ['a', 'b'], defaultSize: 200, min: 100, max: 300, onResize: (s: number) => { got = s } }, ctx)!
    const v = render({ children: ['a', 'b'], defaultSize: 200, min: 100, max: 300, onResize: (s: number) => { got = s } })
    const handle = v.props.children[1]
    // 键盘步进从 200 加到 400 → clamp 300
    for (let i = 0; i < 20; i++) handle.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => {} })
    assert.equal(got, 300, 'max clamp')
    // 键盘减到 0 → clamp 100
    for (let i = 0; i < 20; i++) handle.props.onKeyDown({ key: 'ArrowLeft', preventDefault: () => {} })
    assert.equal(got, 100, 'min clamp')
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
