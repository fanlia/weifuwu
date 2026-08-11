import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Rate } from './Rate.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, mountComponent } from '../../ui-dom/testing.ts'

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
  it('renders count stars (default 5)', async () => {
    const vnode = await renderVNode(Rate, { value: 3 }, createTestCtx())!
    assert.match(vnode.props.class, /wf-rate/)
    const stars = vnode.props.children
    assert.equal(stars.length, 5)
  })

  it('marks active stars up to value', async () => {
    const vnode = await renderVNode(Rate, { value: 3 }, createTestCtx())!
    const stars = vnode.props.children
    assert.match(stars[0].props.class, /wf-rate-star--on/)
    assert.match(stars[2].props.class, /wf-rate-star--on/)
    assert.doesNotMatch(stars[3].props.class, /--on/)
  })

  it('renders custom count', async () => {
    const vnode = await renderVNode(Rate, { value: 1, count: 10 }, createTestCtx())!
    assert.equal(vnode.props.children.length, 10)
  })

  it('calls onChange(3) when clicking 3rd star', async () => {
    let got: number | null = null
    const vnode = await renderVNode(Rate, { value: 0, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(got, 3)
  })

  it('readOnly: no onChange on click, non-focusable', async () => {
    let called = false
    const vnode = await renderVNode(Rate, { value: 2, readOnly: true, onChange: () => { called = true } }, createTestCtx())!
    // span（无 onClick），非 button（不可聚焦）
    assert.equal(vnode.props.children[0].props.onClick, undefined)
    assert.equal(vnode.props.children[0].type, 'span')
    assert.equal(called, false)
  })

  it('disabled: no onChange, non-interactive', async () => {
    let called = false
    const vnode = await renderVNode(Rate, { value: 1, disabled: true, onChange: () => { called = true } }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.onClick, undefined)
    assert.match(vnode.props.class, /wf-rate--disabled/)
    assert.equal(called, false)
  })

  it('keyboard: ArrowRight increases value', async () => {
    let got: number | null = null
    const ev = (key: string) => ({ key, preventDefault: () => {} })
    const vnode = await renderVNode(Rate, { value: 2, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.onKeyDown(ev('ArrowRight'))
    assert.equal(got, 3)
  })

  it('keyboard: ArrowLeft decreases value', async () => {
    let got: number | null = null
    const ev = (key: string) => ({ key, preventDefault: () => {} })
    const vnode = await renderVNode(Rate, { value: 2, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.onKeyDown(ev('ArrowLeft'))
    assert.equal(got, 1)
  })

  it('keyboard: Home sets 1, End sets count', async () => {
    let got: number | null = null
    const ev = (key: string) => ({ key, preventDefault: () => {} })
    const vnode = await renderVNode(Rate, { value: 2, count: 5, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.onKeyDown(ev('Home'))
    assert.equal(got, 1)
    vnode.props.onKeyDown(ev('End'))
    assert.equal(got, 5)
  })

  it('keyboard: clamped at bounds', async () => {
    let got: number | null = null
    const ev = (key: string) => ({ key, preventDefault: () => {} })
    const vnode = await renderVNode(Rate, { value: 5, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.onKeyDown(ev('ArrowRight'))
    assert.equal(got, 5)
  })

  it('allowClear: clicking current value clears to 0', async () => {
    let got: number | null = null
    const vnode = await renderVNode(Rate, { value: 3, allowClear: true, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(got, 0)
  })

  it('allowClear off: clicking current value keeps value', async () => {
    let got: number | null = null
    const vnode = await renderVNode(Rate, { value: 3, onChange: (v: number) => { got = v } }, createTestCtx())!
    vnode.props.children[2].props.onClick()
    assert.equal(got, 3)
  })

  it('renders sizes', async () => {
    for (const s of ['sm', 'md', 'lg'] as const) {
      const vnode = await renderVNode(Rate, { value: 1, size: s }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-rate--${s}`))
    }
  })

  // 回归：hover 是手动状态（let + ctx.ui.render）——旧实现只赋值不 render，
  // effective = hover + 1 是死代码，hover/focus 预览永不落地（§4.1 纪律）
  it('hover: mouseenter 第 4 星 → 前 4 颗亮（render 触发预览）', async () => {
    const ctx = createTestCtx()
    const render = await mountComponent(Rate, { value: 2 }, ctx)!
    let vnode = await render()
    // 接线：ctx.ui.render 真实重跑内层 render（模拟 vdom 渲染器）
    ctx.ui.render = async () => { vnode = await render() }
    vnode.props.children[3].props.onMouseEnter()
    await ctx.ui.render()
    assert.match(vnode.props.children[3].props.class, /wf-rate-star--on/, '悬停第 4 星应亮')
    assert.doesNotMatch(vnode.props.children[4].props.class, /--on/, '第 5 星不亮')
  })

  it('hover: mouseleave 重置预览（恢复 value 显示）', async () => {
    const ctx = createTestCtx()
    const render = await mountComponent(Rate, { value: 2 }, ctx)!
    let vnode = await render()
    ctx.ui.render = async () => { vnode = await render() }
    vnode.props.children[3].props.onMouseEnter()
    await ctx.ui.render()
    assert.match(vnode.props.children[3].props.class, /--on/)
    vnode.props.children[3].props.onMouseLeave()
    await ctx.ui.render()
    assert.doesNotMatch(vnode.props.children[3].props.class, /--on/, '离开后恢复 value=2')
    assert.doesNotMatch(vnode.props.children[2].props.class, /--on/, '第 3 星按 value=2 不亮')
  })

  it('hover: 无 onChange 的非受控组件 hover 也触发 render（预览不依赖受控）', async () => {
    const ctx = createTestCtx()
    const render = await mountComponent(Rate, { value: 1 }, ctx)!
    let vnode = await render()
    ctx.ui.render = async () => { vnode = await render() }
    vnode.props.children[4].props.onMouseEnter()
    await ctx.ui.render()
    assert.match(vnode.props.children[4].props.class, /--on/)
    assert.match(vnode.props.children[0].props.class, /--on/)
  })
})

it('allowHalf：半星渲染 + aria-label', async () => {
  const vnode = await renderVNode(Rate, { value: 3.5, allowHalf: true, count: 5, readOnly: true }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-rate-star--half'), '半星类')
  assert.ok(s.includes('wf-rate-star-half-fg'), '前景裁剪层')
})

it('allowHalf 无效时不渲染半星', async () => {
  const vnode = await renderVNode(Rate, { value: 3.5, count: 5, readOnly: true }, createTestCtx())!
  assert.ok(!JSON.stringify(vnode).includes('wf-rate-star--half'), '无 allowHalf 无半星')
})
