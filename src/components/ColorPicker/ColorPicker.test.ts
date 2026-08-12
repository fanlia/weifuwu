import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ColorPicker } from './ColorPicker.ts'
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

describe('ColorPicker', () => {
  it('renders trigger with current color swatch', async () => {
    const vnode = await renderVNode(ColorPicker, { value: '#4f6ef7' }, createTestCtx())!
    const trigger = vnode.props.children // Popover children = 触发元素
    assert.match(trigger.props.class, /wf-color-picker-trigger/)
    const swatch = trigger.props.children[0]
    assert.match(swatch.props.class, /wf-color-picker-swatch/)
    assert.equal(swatch.props.style.background, '#4f6ef7')
  })

  it('displays hex value in trigger', async () => {
    const vnode = await renderVNode(ColorPicker, { value: '#22c55e' }, createTestCtx())!
    const trigger = vnode.props.children
    const text = trigger.props.children[1]
    assert.equal(text.props.children, '#22c55e')
  })

  it('renders preset swatches in panel', async () => {
    const vnode = await renderVNode(ColorPicker, { value: '#4f6ef7' }, createTestCtx())!
    const panel = vnode.props.content
    assert.match(panel.props.class, /wf-color-picker-panel/)
    const grid = panel.props.children[0]
    const swatches = grid.props.children
    assert.ok(swatches.length >= 8)
  })

  it('clicking swatch calls onChange', async () => {
    let got: string | null = null
    const vnode = await renderVNode(ColorPicker, { value: '#4f6ef7', onChange: (v: string) => { got = v } }, createTestCtx())!
    const panel = vnode.props.content
    const swatches = panel.props.children[0].props.children
    const target = swatches.find((s: any) => s.props.style.background === '#22c55e')
    target.props.onClick()
    assert.equal(got, '#22c55e')
  })

  it('selected swatch marked', async () => {
    const vnode = await renderVNode(ColorPicker, { value: '#22c55e' }, createTestCtx())!
    const panel = vnode.props.content
    const swatches = panel.props.children[0].props.children
    const sel = swatches.filter((s: any) => s.props.class.includes('--sel'))
    assert.equal(sel.length, 1)
    assert.equal(sel[0].props.style.background, '#22c55e')
  })

  it('renders hex input when showInput', async () => {
    const vnode = await renderVNode(ColorPicker, { value: '#4f6ef7', showInput: true }, createTestCtx())!
    const panel = vnode.props.content
    const input = panel.props.children[1]
    assert.equal(input.props.class, 'wf-color-picker-input')
    assert.equal(input.props.value, '#4f6ef7')
  })

  it('hex input commits valid color', async () => {
    let got: string | null = null
    const vnode = await renderVNode(ColorPicker, { value: '#4f6ef7', showInput: true, onChange: (v: string) => { got = v } }, createTestCtx())!
    const input = vnode.props.content.props.children[1]
    input.props.onInput({ target: { value: '#ff0000' } } as any)
    assert.equal(got, '#ff0000')
  })

  it('hex input ignores invalid color', async () => {
    let got: string | null = null
    const vnode = await renderVNode(ColorPicker, { value: '#4f6ef7', showInput: true, onChange: (v: string) => { got = v } }, createTestCtx())!
    const input = vnode.props.content.props.children[1]
    input.props.onInput({ target: { value: 'not-a-color' } } as any)
    assert.equal(got, null)
  })

  it('disabled: no trigger interaction', async () => {
    const vnode = await renderVNode(ColorPicker, { value: '#4f6ef7', disabled: true }, createTestCtx())!
    assert.equal(vnode.props.disabled, true)
  })

  it('accepts custom color palette', async () => {
    const colors = ['#111111', '#222222']
    const vnode = await renderVNode(ColorPicker, { value: '#111111', colors }, createTestCtx())!
    const swatches = vnode.props.content.props.children[0].props.children
    assert.equal(swatches.length, 2)
  })
})

describe('ColorPicker 弹层 aria（P13 a11y 补缺）', () => {
  it('trigger 有 aria-haspopup + aria-expanded=false（初始关闭）', async () => {
    const vnode = await renderVNode(ColorPicker, { value: '#ff0000' }, createTestCtx() as any)
    const trigger = vnode.props.children
    assert.equal(trigger.props['aria-haspopup'], 'dialog')
    assert.equal(trigger.props['aria-expanded'], 'false')
  })
})
