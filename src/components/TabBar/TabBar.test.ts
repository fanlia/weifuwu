import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
import { renderVNode, findByClass, createTestCtx, mountComponent } from '../../ui-dom/testing.ts'
import { TabBar } from './TabBar.ts'

before(setupJsdom)

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) { for (const k of kids) { const f = findVNode(k, pred); if (f) return f } }
  else if (kids && typeof kids === 'object') return findVNode(kids, pred)
  return null
}

const ITEMS = [
  { key: 'msg', label: '消息', icon: 'message', badge: 3 },
  { key: 'contacts', label: '通讯录', icon: 'users' },
  { key: 'me', label: '我', icon: 'user' },
] as any

describe('TabBar', () => {
  it('渲染 items：3 tab + role=tab + aria-selected', async () => {
    const vnode = await renderVNode(TabBar, { items: ITEMS }, createTestCtx())!
    assert.ok(findByClass(vnode, 'wf-tab-bar'), '根类')
    const tabs = vnode.props.children
    assert.equal(tabs.length, 3)
    assert.equal(tabs[0].props.role, 'tab')
    assert.equal(tabs[0].props['aria-selected'], 'true', '默认第一个激活')
    assert.equal(tabs[1].props['aria-selected'], 'false')
  })

  it('非受控：点击切换激活 + onChange 回调', async () => {
    const calls: string[] = []
    const render = await mountComponent(TabBar, { items: ITEMS, onChange: (k: string) => calls.push(k) }, createTestCtx())
    let vnode = (await render())!
    vnode.props.children[1].props.onClick()
    assert.deepEqual(calls, ['contacts'], '点击第二个 → onChange')
    vnode = (await render())!
    assert.equal(vnode.props.children[1].props['aria-selected'], 'true', '激活态跟随')
    assert.equal(vnode.props.children[0].props['aria-selected'], 'false')
  })

  it('受控：activeKey 驱动激活态（组件不改内部状态）', async () => {
    const vnode = await renderVNode(TabBar, { items: ITEMS, activeKey: 'me' }, createTestCtx())!
    assert.equal(vnode.props.children[2].props['aria-selected'], 'true')
    assert.equal(vnode.props.children[2].props.tabindex, 0, 'roving tabindex：仅激活可 Tab 聚焦')
    assert.equal(vnode.props.children[0].props.tabindex, -1)
  })

  it('受控纪律：activeKey 无 onChange → console.warn', async () => {
    const warns: string[] = []
    const orig = console.warn
    console.warn = (m: string) => warns.push(String(m))
    try {
      await renderVNode(TabBar, { items: ITEMS, activeKey: 'msg' }, createTestCtx())!
    } finally {
      console.warn = orig
    }
    assert.ok(warns.some((w) => w.includes('[TabBar]') && w.includes('onChange')), '明确提示缺回调')
  })

  it('键盘：方向键移动激活（焦点跟随语义——roving tabindex）', async () => {
    const calls: string[] = []
    // mountComponent：同实例 re-render（键盘切换后内部激活态更新——闭包必须读最新）
    const render = await mountComponent(TabBar, { items: ITEMS, onChange: (k: string) => calls.push(k) }, createTestCtx())
    let vnode = (await render())!
    // 从第一个（msg）按 ArrowRight → contacts
    vnode.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => {} })
    assert.deepEqual(calls, ['contacts'])
    // 重新渲染（内部激活态 = contacts）→ 从 contacts 按 ArrowLeft → msg
    vnode = (await render())!
    vnode.props.onKeyDown({ key: 'ArrowLeft', preventDefault: () => {} })
    assert.deepEqual(calls, ['contacts', 'msg'])
  })

  it('键盘：跳过 disabled 项', async () => {
    const items = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', disabled: true }, { key: 'c', label: 'C' }]
    const calls: string[] = []
    const render = await mountComponent(TabBar, { items, onChange: (k: string) => calls.push(k) }, createTestCtx())
    const vnode = (await render())!
    vnode.props.onKeyDown({ key: 'ArrowRight', preventDefault: () => {} })
    assert.deepEqual(calls, ['c'], '从 a 右移跳过 b（disabled）→ c')
  })

  it('badge 角标渲染', async () => {
    const vnode = await renderVNode(TabBar, { items: ITEMS }, createTestCtx())!
    const badge = findVNode(vnode, (v: any) => v?.props?.class === 'wf-tab-bar-badge')
    assert.ok(badge, 'badge 存在')
    assert.equal(badge.props.children, 3)
  })

  it('disabled 项：无 onClick、disabled 属性', async () => {
    const items = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', disabled: true }]
    const vnode = await renderVNode(TabBar, { items }, createTestCtx())!
    assert.equal(vnode.props.children[1].props.disabled, true)
    assert.equal(vnode.props.children[1].props.onClick, undefined)
  })

  it('fixed 模式：wf-tab-bar--fixed 类', async () => {
    const vnode = await renderVNode(TabBar, { items: ITEMS, fixed: true }, createTestCtx())!
    assert.ok(vnode.props.class.includes('wf-tab-bar--fixed'))
  })

  it('icon 字符串 → Icon 组件（type 为函数）', async () => {
    const vnode = await renderVNode(TabBar, { items: ITEMS }, createTestCtx())!
    const iconWrap = findVNode(vnode, (v: any) => v?.props?.class === 'wf-tab-bar-icon-wrap')
    const icon = iconWrap.props.children[0]
    assert.equal(typeof icon.type, 'function', 'icon 渲染为 Icon 组件')
  })
})
