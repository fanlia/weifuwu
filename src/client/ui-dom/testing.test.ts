import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { h } from './vnode.ts'
import {
  renderVNode, mountComponent, walkVNode, findVNode, findByClass, createTestCtx, createPopupMock,
} from './testing.ts'

// ── 两阶段组件样本 ─────────────────────────────────────

const Stateless = async (_init: any, _ctx: any) => async (props: any) => h('div', { class: 'x' }, props.label)

const Counter = async (_init: any, _ctx: any) => {
  let count = 0
  return (_props: any) => h('button', { onClick: () => { count++ } }, String(count))
}

const TreeComp = async (_init: any, _ctx: any) =>
  (props: any) => h('div', { class: 'root' }, [
    h('span', { class: 'a' }, 'A'),
    [h('i', { class: 'b' }, 'B1'), h('i', { class: 'b2' }, 'B2')], // 嵌套数组（Select optgroup 同款）
  ])

describe('ui-dom/testing — renderVNode', () => {
  it('两阶段组件渲染到 VNode 层（mount + render 一次）', async () => {
    const v: any = await renderVNode(Stateless, { label: 'hi' }, createTestCtx())
    assert.ok(v && v.props.class === 'x')
    assert.equal(v.props.children, 'hi')
  })

  it('只渲染一层：子组件保留为函数引用', async () => {
    const Parent = async (_i: any, _c: any) => async () => h('div', {}, h(Stateless, { label: 'child' }))
    const v: any = await renderVNode(Parent, {}, createTestCtx())
    const child = v!.props.children
    assert.equal(child.type, Stateless, '子组件不展开')
  })

  it('无状态组件（直接返回 render 函数）', async () => {
    const v: any = await renderVNode(Counter, {}, createTestCtx())
    assert.equal(v!.props.children, '0')
  })
})

describe('ui-dom/testing — mountComponent（同实例）', () => {
  it('re-render 保留内部状态（renderVNode 每次新 mount 会丢）', async () => {
    const render = await mountComponent(Counter, {}, createTestCtx())
    let v = render()!
    assert.equal(v.props.children, '0')
    ;(v.props.onClick as () => void)() // 内部 count++
    v = render()!
    assert.equal(v.props.children, '1', '同实例状态保留')
  })

  it('props 变化 re-render 同样保留状态', async () => {
    const render = await mountComponent(Counter, {}, createTestCtx())
    render()
    const v2 = render()!
    assert.equal(v2.props.children, '0')
  })
})

describe('ui-dom/testing — walkVNode / findVNode / findByClass', () => {
  it('walkVNode 遍历全部节点（含嵌套数组 children）', async () => {
    const v = await renderVNode(TreeComp, {}, createTestCtx())
    const seen: string[] = []
    walkVNode(v, (n: any) => { if (typeof n?.props?.class === 'string') seen.push(n.props.class) })
    assert.deepEqual(seen, ['root', 'a', 'b', 'b2'], '嵌套数组 [B1,B2] 被遍历')
  })

  it('findByClass 精确匹配 token（includes 会误匹配 b ⊃ b2）', async () => {
    const v = await renderVNode(TreeComp, {}, createTestCtx())
    const b = findByClass(v, 'b')
    assert.equal(b.length, 1, '仅 .b 一个（b2 不误报）')
    assert.equal(b[0].props.children, 'B1')
  })

  it('findVNode 按谓词查询组件 type', async () => {
    const v = await renderVNode(TreeComp, {}, createTestCtx())
    const span = findVNode(v, (n: any) => n?.type === 'span')
    assert.ok(span)
    assert.equal(span.props.class, 'a')
  })
})

describe('ui-dom/testing — createTestCtx / createPopupMock', () => {
  it('默认 ctx：render / ready（render-only 无 $ / dirty）', () => {
    const ctx = createTestCtx()
    assert.equal(typeof ctx.render, 'function')
    assert.equal((ctx.ui as any).ready, true)
    assert.doesNotThrow(() => ctx.render())
  })

  it('覆盖任意原语（usePopup 注入）', () => {
    const popup = createPopupMock(() => true)
    const ctx = createTestCtx({ ui: { usePopup: () => popup } })
    assert.equal((ctx.ui as any).usePopup(), popup)
  })

  it('createPopupMock：portal 按 isOpen 条件渲染 + getter open', () => {
    let open = false
    const popup = createPopupMock(() => open)
    assert.equal(popup.open, false)
    assert.equal(popup.portal('x'), null, 'closed → 不渲染')
    open = true
    assert.equal(popup.open, true)
    assert.equal(popup.portal('x'), 'x', 'open → 渲染')
    assert.equal(typeof popup.setOpen, 'function')
    assert.equal(typeof popup.refresh, 'function')
    assert.equal(typeof popup.wrapProps, 'object')
  })
})
