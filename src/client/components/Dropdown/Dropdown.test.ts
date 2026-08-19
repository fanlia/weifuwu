import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../vdom/setup.ts'
setupJsdom()
import { Dropdown } from './Dropdown.ts'
import { h } from '../../vdom/index.ts'
import { Portal } from '../../vdom/core/node/portal.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** usePopup mock：镜像真实语义（受控 isOpen + wf-popup 合并 + Escape via wrapProps） */
function makeCtx(): UIContext {
  const openStates = new Map<string, boolean>()
  return createTestCtx({ ui: {
    useOpen: (opts: any) => {
      const key = opts.name ?? 'default'
      if (!openStates.has(key)) openStates.set(key, false)
      const controlled = opts.open !== undefined
      const isOpen = () => controlled ? !!opts.open : (openStates.get(key) ?? false)
      const setOpen = (v: boolean) => {
        if (controlled) opts.onOpenChange?.(v)
        else openStates.set(key, v)
      }
      return {
        get open() { return isOpen() },
        setOpen,
        triggerProps: { onClick: () => setOpen(true), onFocus: () => {} },
      }
    },
    usePopup: (opts: any) => {
      // 对齐真实 usePopup：isOpen 是函数（迁移后无 open 参数——用 isOpen()）
      const isOpen = () => (opts.isOpen ? opts.isOpen() : false)
      const portal = (content: any) => {
        if (!isOpen()) return null
        return {
          type: Portal,
          props: {
            children: { ...content, props: { ...content.props, class: ['wf-popup', content.props?.class].filter(Boolean).join(' ') } },
            portalKey: 'dropdown',
          },
          key: undefined,
          _placement: 'remote',
        }
      }
      return {
        open: isOpen(),
        setOpen: (v: any) => { opts.onOpenChange?.(v) },
        wrapProps: {
          onClick: () => {},
          // 对齐真实 usePopup：Escape 调 setOpen（受控走 onOpenChange）
          onKeyDown: (e: any) => { if (e.key === 'Escape') opts.setOpen?.(false) },
        },
        portal,
        refresh: () => {},
      }
    },
  } }) as any
}

/** Call component and get VNode (compatible with two-phase model) */

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Dropdown', () => {
  const trigger = { type: 'button', props: { children: '菜单' }, key: undefined }

  it('renders trigger', async () => {
    const vnode = await renderVNode(Dropdown, { trigger }, makeCtx())!
    assert.equal(vnode.type, 'div')
    const firstChild = vnode.props.children[0]
    assert.equal(firstChild.props.children, '菜单')
  })

  it('renders menu when open', async () => {
    const items = [
      { label: '编辑', onClick: () => {} },
      { label: '删除', onClick: () => {} },
    ]
    const vnode = await renderVNode(Dropdown, { trigger, items, open: true }, makeCtx())!
    // children: [trigger, portalVNode]
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    assert.ok(portal, '应有 Portal VNode')
    const menu = await inner(portal)
    assert.equal(menu.type, 'div')
    assert.match(menu.props.class, /wf-dropdown-menu/)
    assert.match(menu.props.class, /wf-popup/, 'usePopup 附加 wf-popup 基类')
    assert.equal(menu.props.children.length, 2)
  })

  it('does not render menu when not open', async () => {
    const vnode = await renderVNode(Dropdown, { trigger, items: [{ label: '编辑', onClick: () => {} }] }, makeCtx())!
    assert.equal(vnode.props.children.length, 1) // only trigger, no portal
  })

  it('renders danger variant', async () => {
    const items = [
      { label: '删除', variant: 'danger' as const, onClick: () => {} },
    ]
    const vnode = await renderVNode(Dropdown, { trigger, items, open: true }, makeCtx())!
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    const menu = await inner(portal)
    const btn = menu.props.children[0]
    assert.match(btn.props.class, /wf-dropdown-item--danger/)
  })

  it('renders items with correct labels', async () => {
    const items = [
      { label: '编辑', onClick: () => {} },
      { label: '删除', variant: 'danger' as const, onClick: () => {} },
    ]
    const vnode = await renderVNode(Dropdown, { trigger, items, open: true }, makeCtx())!
    const portal = vnode.props.children.find((c: any) => c?.type === Portal)
    const menu = await inner(portal)
    assert.equal(menu.props.role, 'menu')
    assert.equal(menu.props.children[0].props.role, 'menuitem')
    assert.equal(menu.props.children[0].props.children, '编辑')
  })

  it('adds open class when open', async () => {
    const vnode = await renderVNode(Dropdown, { trigger, open: true }, makeCtx())!
    assert.match(vnode.props.class, /wf-dropdown--open/)
  })

  it('包装层带 aria-haspopup / aria-expanded', async () => {
    const closed = await renderVNode(Dropdown, { trigger }, makeCtx())!
    assert.equal(closed.props['aria-haspopup'], 'menu')
    assert.equal(closed.props['aria-expanded'], 'false')
    const opened = await renderVNode(Dropdown, { trigger, open: true }, makeCtx())!
    assert.equal(opened.props['aria-expanded'], 'true')
  })

  it('Escape 触发 onOpenChange(false)（wrapProps，document 级语义）', async () => {
    const items = [{ label: '编辑' }, { label: '删除', variant: 'danger' as const }]
    let closed = 0
    const vnode = await renderVNode(Dropdown, { trigger, items, open: true, onOpenChange: (v: boolean) => { if (!v) closed++ } }, makeCtx())!
    assert.equal(typeof vnode.props.onKeyDown, 'function')
    vnode.props.onKeyDown({ key: 'Escape' })
    assert.equal(closed, 1)
    vnode.props.onKeyDown({ key: 'Enter' })
    assert.equal(closed, 1, '非 Escape 键不关闭')
  })
})

describe('Dropdown 键盘导航（R43 W1 兑现）', () => {
  const key = (k: string) => ({ key: k, preventDefault() {}, stopPropagation() {} })
  const items = [
    { label: '复制', onClick: () => { clicked = 'copy' } },
    { label: '重命名', onClick: () => { clicked = 'rename' } },
    { label: '删除', variant: 'danger' as const, onClick: () => { clicked = 'del' } },
  ]
  let clicked = ''
  const trigger = h('button', { class: 'trigger' }, '操作')

  /** 手动两阶段：mount 一次 + render 多次（同实例——hl/prevOpen 状态保持）；open 受控 */
  async function makeRender(open: boolean, extra?: any) {
    const props = { trigger, items, open, onOpenChange: () => {}, ...extra }
    const renderFn = await Dropdown(props, makeCtx())
    const render = (o: boolean, ex?: any) => renderFn({ trigger, items, open: o, onOpenChange: () => {}, ...(ex ?? {}) })
    return { render, v: await render(open) }
  }
  // v = wrap div（class wf-dropdown）——children = [trigger, portal]；menu 在 portal 内
  const menuOf = (v: any) => {
    const portal = v.props.children.find((c: any) => c?.type === Portal)
    return portal?.props?.children ?? null
  }
  const hlOf = (menu: any) => [...menu.props.children].find((c: any) => String(c.props?.class).includes('--hl'))

  it('ArrowDown 移动高亮 + Enter 触发并关闭', async () => {
    clicked = ''
    const { render } = await makeRender(true)
    let v = await render(true)
    let menu = menuOf(v)
    menu.props.onKeyDown(key('ArrowDown'))
    v = await render(true)
    menu = menuOf(v)
    assert.equal(hlOf(menu)?.props?.children, '重命名', `ArrowDown 高亮重命名: ${hlOf(menu)?.props?.class}`)
    menu.props.onKeyDown(key('Enter'))
    assert.equal(clicked, 'rename', 'Enter 触发重命名 onClick')
  })

  it('Home/End 跳转 + disabled 项跳过', async () => {
    const withDis = [
      { label: '复制', onClick: () => {} },
      { label: '禁用项', disabled: true },
      { label: '重命名', onClick: () => { clicked = 'rename' } },
    ]
    const { render } = await makeRender(true, { items: withDis })
    let v = await render(true, { items: withDis })
    let menu = menuOf(v)
    menu.props.onKeyDown(key('End'))
    v = await render(true, { items: withDis })
    menu = menuOf(v)
    assert.equal(hlOf(menu)?.props?.children, '重命名', 'End 跳到最后可用项（跳过 disabled）')
    menu.props.onKeyDown(key('ArrowDown'))
    v = await render(true, { items: withDis })
    menu = menuOf(v)
    assert.equal(hlOf(menu)?.props?.children, '重命名', 'ArrowDown 越界钳制')
  })

  it('打开时高亮重置第一项', async () => {
    const { render } = await makeRender(true)
    let v = await render(true)
    let menu = menuOf(v)
    menu.props.onKeyDown(key('ArrowDown'))
    v = await render(false)
    v = await render(true)
    menu = menuOf(v)
    assert.equal(hlOf(menu)?.props?.children, '复制', '重开高亮重置第一项')
  })
})
