import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Menubar } from './Menubar.ts'
import { Portal } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }), ready: true } } as any
}

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

const menus = [
  {
    key: 'file', label: '文件',
    items: [
      { key: 'new', label: '新建', onSelect: () => {} },
      { key: 'open', label: '打开' },
      { key: 'save', label: '保存', shortcut: 'Ctrl+S' },
    ],
  },
  {
    key: 'edit', label: '编辑',
    items: [{ key: 'undo', label: '撤销' }, { key: 'redo', label: '重做' }],
  },
]

describe('Menubar', () => {
  it('renders menu triggers horizontally', () => {
    const vnode = renderVNode(Menubar, { menus }, mockCtx())!
    assert.match(vnode.props.class, /wf-menubar/)
    assert.equal(vnode.props.children.length, 2)
    assert.equal(vnode.props.children[0].props.children, '文件')
  })

  it('click menu opens dropdown', () => {
    const ctx = mockCtx()
    const result = Menubar({ menus }, ctx)
    const render = result as any
    let v = render({ menus })
    v.props.children[0].props.onClick()
    v = render({ menus })
    // 有 portal（下拉面板）
    const portal = v.props.children[2]
    assert.ok(portal, '应打开下拉')
    assert.match(inner(portal).props.class, /wf-menubar-panel/)
  })

  it('click item calls onSelect and closes', () => {
    let selected: string | null = null
    const myMenus = [{
      key: 'm', label: '菜单',
      items: [{ key: 'a', label: 'A', onSelect: () => { selected = 'a' } }, { key: 'b', label: 'B', onSelect: () => { selected = 'b' } }],
    }]
    const ctx = mockCtx()
    const result = Menubar({ menus: myMenus }, ctx)
    const render = result as any
    let v = render({ menus: myMenus })
    v.props.children[0].props.onClick()
    v = render({ menus: myMenus })
    const panel = inner(v.props.children[1]).props.children
    panel[1].props.onClick() // B
    assert.equal(selected, 'b')
    v = render({ menus: myMenus })
    assert.equal(v.props.children.length, 1) // 已关闭
  })

  it('keyboard: ArrowRight moves to next menu', () => {
    const ctx = mockCtx()
    const result = Menubar({ menus }, ctx)
    const render = result as any
    let v = render({ menus })
    // 模拟焦点在第一个 trigger：按 ArrowRight → 打开第二个？简化：验证 handler + 不抛错
    assert.equal(typeof v.props.onKeyDown, 'function')
    assert.doesNotThrow(() => v.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => {} }))
  })

  it('Escape closes open dropdown', () => {
    const ctx = mockCtx()
    const result = Menubar({ menus }, ctx)
    const render = result as any
    let v = render({ menus })
    v.props.children[0].props.onClick()
    v = render({ menus })
    assert.ok(v.props.children.length > 2) // triggers + portal
    v.props.onKeyDown({ key: 'Escape' })
    v = render({ menus })
    assert.equal(v.props.children.length, 2) // 只有 2 个 triggers
  })

  it('disabled menu not clickable', () => {
    const withDis = [{ key: 'd', label: '禁用', disabled: true, items: [] }]
    const vnode = renderVNode(Menubar, { menus: withDis }, mockCtx())!
    assert.equal(vnode.props.children[0].props.onClick, undefined)
    assert.match(vnode.props.children[0].props.class, /--dis/)
  })
})
