import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { FloatButton, FloatButtonGroup } from './FloatButton.ts'
import { h } from '../../client/vnode.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) {
    for (const k of kids) {
      const found = findVNode(k, pred)
      if (found) return found
    }
  } else if (kids && typeof kids === 'object') {
    return findVNode(kids, pred)
  }
  return null
}

function mount(Comp: any, props: any, ctx: any) {
  const factory = Comp({}, ctx)
  return { render: (p: any = props) => factory(p) }
}

const mockCtx = () => ({ ui: { $: () => ({}), render: () => {}, dirty: () => {} } }) as any

describe('FloatButton', () => {
  test('渲染悬浮按钮 + fixed 定位 + 点击回调', () => {
    let clicked = 0
    const vnode = renderVNode(
      FloatButton,
      { icon: h('span', { class: 'plus' }), onClick: () => clicked++, 'aria-label': '新增' },
      mockCtx(),
    )
    const btn = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-float-btn'))
    assert.ok(btn, '存在按钮')
    assert.equal(btn.props.style?.position, 'fixed', 'fixed 定位')
    btn.props.onClick()
    assert.equal(clicked, 1)
  })

  test('位置：top-left / top-right / bottom-left / bottom-right', () => {
    const v1 = renderVNode(FloatButton, { position: 'top-right', children: 'x' }, mockCtx())
    const b1 = findVNode(v1, (v: any) => v.props?.class?.includes('wf-float-btn'))
    assert.match(b1.props.class, /wf-float-btn--top-right/)
    const v2 = renderVNode(FloatButton, { position: 'bottom-left', children: 'x' }, mockCtx())
    const b2 = findVNode(v2, (v: any) => v.props?.class?.includes('wf-float-btn'))
    assert.match(b2.props.class, /wf-float-btn--bottom-left/)
  })

  test('badge 显示', () => {
    const vnode = renderVNode(FloatButton, { badge: 5, children: 'x' }, mockCtx())
    const badge = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-float-btn-badge'))
    assert.equal(badge.props.children, '5')
  })

  test('disabled 阻断', () => {
    let clicked = 0
    const vnode = renderVNode(
      FloatButton,
      { disabled: true, onClick: () => clicked++, children: 'x' },
      mockCtx(),
    )
    const btn = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-float-btn'))
    assert.equal(btn.props.onClick, undefined, 'disabled 无 onClick')
  })
})

describe('FloatButtonGroup', () => {
  test('组内子项注入 static（不 fixed——防重叠）', () => {
    const ctx = mockCtx()
    const kids = [h(FloatButton, { icon: 'x' }), h(FloatButton, { icon: 'y' })]
    const inst = mount(FloatButtonGroup, { children: kids }, ctx)
    let vnode = inst.render({ children: kids })
    const main = findVNode(vnode, (v: any) => String(v.props?.class ?? '').split(' ').includes('wf-float-group-main'))
    main.props.onClick()
    vnode = inst.render({ children: kids })
    // 子项是组件 VNode（type=FloatButton）——static 注入到 props
    const item = findVNode(vnode, (v: any) => String(v.props?.class ?? '').split(' ').includes('wf-float-group-item'))
    assert.ok(item, '子项容器')
    const btnChild = item.props.children
    assert.equal(btnChild.type, FloatButton, '子项是 FloatButton 组件')
    assert.equal(btnChild.props.static, true, 'static 注入（不 fixed）')
  })

  test('展开状态机：点击主按钮展开/收起', () => {
    const ctx = mockCtx()
    const inst = mount(FloatButtonGroup, { children: ['a', 'b'] }, ctx)
    let vnode = inst.render({ children: ['a', 'b'] })
    const main = findVNode(vnode, (v: any) => String(v.props?.class ?? '').split(' ').includes('wf-float-group-main'))
    assert.ok(main)
    // 点击展开
    main.props.onClick()
    vnode = inst.render({ children: ['a', 'b'] })
    const expanded = findVNode(vnode, (v: any) => String(v.props?.class ?? '').split(' ').includes('wf-float-group--open'))
    assert.ok(expanded, '展开后 open class')
    // 再点收起
    const main2 = findVNode(vnode, (v: any) => String(v.props?.class ?? '').split(' ').includes('wf-float-group-main'))
    main2.props.onClick()
    vnode = inst.render({ children: ['a', 'b'] })
    const closed = findVNode(vnode, (v: any) => String(v.props?.class ?? '').split(' ').includes('wf-float-group--open'))
    assert.equal(closed, null, '收起后移除 open class')
  })
})
