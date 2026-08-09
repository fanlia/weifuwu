import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Layout, LayoutHeader, LayoutSider, LayoutContent, LayoutFooter } from './Layout.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const mockCtx = () => ({
  ui: {
    $: () => ({}),
    render: () => {},
    dirty: () => {},
  },
}) as any

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

const findClass = (vnode: any, cls: string) =>
  findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes(cls))

describe('Layout', () => {
  test('基础结构：flex column + wf-layout class', () => {
    const vnode = renderVNode(Layout, { children: '内容' }, mockCtx())
    const layout = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-layout'))
    assert.ok(layout, '存在 wf-layout 根节点')
    assert.match(layout.props?.class, /^wf-layout( |$)/, '根 class 为 wf-layout 开头')
  })

  test('含 Sider → row 模式（flex-direction: row）', () => {
    const vnode = renderVNode(
      Layout,
      { children: [{ type: LayoutSider, props: { children: '导航' } }, 'main'] },
      mockCtx(),
    )
    const layout = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-layout'))
    assert.match(layout.props?.class, /wf-layout--row/, '含 Sider 时 row 布局')
  })

  test('无 Sider → column 模式', () => {
    const vnode = renderVNode(
      Layout,
      { children: [renderVNode(LayoutHeader, { children: '头' }, mockCtx()), 'main'] },
      mockCtx(),
    )
    const layout = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-layout'))
    assert.match(layout.props?.class, /wf-layout--column/)
  })

  test('子组件渲染语义 class', () => {
    const vnode = renderVNode(
      Layout,
      {
        children: [
          renderVNode(LayoutHeader, { children: 'h' }, mockCtx()),
          renderVNode(LayoutContent, { children: 'c' }, mockCtx()),
          renderVNode(LayoutFooter, { children: 'f' }, mockCtx()),
        ],
      },
      mockCtx(),
    )
    assert.ok(findClass(vnode, 'wf-layout-header'))
    assert.ok(findClass(vnode, 'wf-layout-content'))
    assert.ok(findClass(vnode, 'wf-layout-footer'))
  })

  test('Sider 默认宽度 240（token 默认）', () => {
    const vnode = renderVNode(LayoutSider, { children: '导航' }, mockCtx())
    const sider = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-layout-sider'))
    assert.equal(sider.props?.style?.width, 'var(--wf-layout-sider-width, 240px)')
  })

  test('Sider collapsed → 折叠宽度 64', () => {
    const vnode = renderVNode(LayoutSider, { collapsed: true, children: '导航' }, mockCtx())
    const sider = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-layout-sider'))
    assert.equal(sider.props?.style?.width, 'var(--wf-layout-sider-collapsed-width, 64px)')
    assert.match(sider.props?.class, /wf-layout-sider--collapsed/)
  })

  test('Sider 受控：collapsible + collapsed + onCollapse 回调', () => {
    let emitted: boolean | null = null
    const vnode = renderVNode(
      LayoutSider,
      { collapsible: true, collapsed: false, onCollapse: (v: boolean) => { emitted = v }, children: 'x' },
      mockCtx(),
    )
    const trigger = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-layout-sider-trigger'))
    assert.ok(trigger, 'collapsible 显示触发按钮')
    trigger.props.onClick()
    assert.equal(emitted, true, '点击触发 onCollapse(true)')
  })

  test('Layout 嵌套：Sider + 内层 Layout（Header/Content/Footer 竖排）', () => {
    const inner = renderVNode(
      Layout,
      { children: [
        { type: LayoutHeader, props: { children: 'h' } },
        { type: LayoutContent, props: { children: 'c' } },
      ] },
      mockCtx(),
    )
    const vnode = renderVNode(
      Layout,
      { children: [{ type: LayoutSider, props: { children: 'nav' } }, inner] },
      mockCtx(),
    )
    const layouts = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-layout--row'))
    assert.ok(layouts, '外层 row')
    const innerCol = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-layout--column'))
    assert.ok(innerCol, '内层 column')
  })
})
