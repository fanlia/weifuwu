import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Dropdown } from './Dropdown.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Dropdown', () => {
  const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }

  it('renders trigger', () => {
    const vnode = Dropdown({ trigger }, mockCtx())!
    assert.equal(vnode.type, 'div')
    const firstChild = vnode.props.children[0]
    assert.equal(firstChild.props.children, '菜单')
  })

  it('renders menu when open', () => {
    const items = [
      { label: '编辑', onClick: () => {} },
      { label: '删除', onClick: () => {} },
    ]
    const vnode = Dropdown({ trigger, items, open: true }, mockCtx())!
    const menu = vnode.props.children[1]
    assert.equal(menu.type, 'div')
    assert.match(menu.props.class, /wf-dropdown-menu/)
    assert.equal(menu.props.children.length, 2)
  })

  it('does not render menu when not open', () => {
    const vnode = Dropdown({ trigger, items: [{ label: '编辑', onClick: () => {} }] }, mockCtx())!
    assert.equal(vnode.props.children.length, 1) // only trigger, no menu
  })

  it('renders danger variant', () => {
    const items = [
      { label: '删除', variant: 'danger' as const, onClick: () => {} },
    ]
    const vnode = Dropdown({ trigger, items, open: true }, mockCtx())!
    const btn = vnode.props.children[1].props.children[0]
    assert.match(btn.props.class, /wf-dropdown-item--danger/)
  })
})

  it('renders items with correct labels', () => {
    const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }
    const items = [
      { label: '编辑', onClick: () => {} },
      { label: '删除', variant: 'danger' as const, onClick: () => {} },
    ]
    const vnode = Dropdown({ trigger, items, open: true }, mockCtx())!
    const menu = vnode.props.children[1]
    assert.equal(menu.props.role, 'menu')
    assert.equal(menu.props.children[0].props.role, 'menuitem')
    assert.equal(menu.props.children[0].props.children, '编辑')
  })

  it('adds open class when open', () => {
    const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }
    const vnode = Dropdown({ trigger, open: true }, mockCtx())!
    assert.match(vnode.props.class, /wf-dropdown--open/)
  })
