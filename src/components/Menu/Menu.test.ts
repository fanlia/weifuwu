import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Menu } from './Menu.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}
function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

const items = [
  { key: 'home', label: '首页', icon: '🏠' },
  { key: 'users', label: '用户管理' },
  { key: 'settings', label: '设置' },
]

describe('Menu', () => {
  it('渲染 nav + 导航项（role=menuitem）', () => {
    const vnode = renderVNode(Menu, { items }, mockCtx())!
    assert.equal(vnode.type, 'nav')
    assert.match(vnode.props.class, /wf-menu/)
    const itemEls = vnode.props.children.filter((c: any) => c?.props?.role === 'menuitem')
    assert.equal(itemEls.length, 3)
    assert.equal(itemEls[0].props.children[1].props.children, '首页') // label span
  })

  it('activeKey 高亮类', () => {
    const vnode = renderVNode(Menu, { items, activeKey: 'users' }, mockCtx())!
    const item = vnode.props.children.find((c: any) => c?.props?.['data-key'] === 'users')
    assert.match(item.props.class, /wf-menu-item--active/)
    assert.equal(item.props['aria-current'], 'page')
  })

  it('分组渲染分组标题', () => {
    const grouped = [
      { key: 'a', label: 'A', group: '工作台' },
      { key: 'b', label: 'B', group: '管理' },
      { key: 'c', label: 'C', group: '管理' },
    ]
    const vnode = renderVNode(Menu, { items: grouped }, mockCtx())!
    const texts = collectText(vnode)
    assert.ok(texts.includes('工作台'))
    assert.ok(texts.includes('管理'))
  })

  it('点击项 → onSelect(key)', () => {
    let picked = ''
    const vnode = renderVNode(Menu, { items, onSelect: (k: string) => { picked = k } }, mockCtx())!
    const item = vnode.props.children.find((c: any) => c?.props?.['data-key'] === 'settings')
    item.props.onClick()
    assert.equal(picked, 'settings')
  })

  it('onClick 优先于 onSelect（item 自身处理）', () => {
    let picked = ''
    let clicked = ''
    const vnode = renderVNode(Menu, {
      items: [{ key: 'x', label: 'X', onClick: () => { clicked = 'x' } }],
      onSelect: (k: string) => { picked = k },
    }, mockCtx())!
    const item = vnode.props.children.find((c: any) => c?.props?.['data-key'] === 'x')
    item.props.onClick()
    assert.equal(clicked, 'x')
    assert.equal(picked, '')
  })
})

function collectText(v: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (n == null || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n.props?.children != null) walk(n.props.children)
  }
  walk(v)
  return out
}
