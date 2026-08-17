import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
import { renderVNode, findByClass, createTestCtx, mountComponent } from '../../ui-dom/testing.ts'
import { ActionSheet } from './ActionSheet.ts'

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
  { key: 'camera', label: '拍照', icon: 'camera' },
  { key: 'album', label: '从相册选择', icon: 'image' },
  { key: 'delete', label: '删除', icon: 'trash', danger: true },
] as any

const ctx = () => createTestCtx({
  ui: {
    usePopup: () => ({
      phase: 'open' as const, sync: (o: boolean) => o ? 'open' as const : 'closed' as const,
      portal: (c: any) => c, setOpen: () => {}, isOpen: () => true, refresh: () => {},
    }),
    useGlobalKey: () => {},
  },
})

describe('ActionSheet', () => {
  it('open=true 渲染面板（items + 取消按钮 + role=menu）', async () => {
    const vnode = await renderVNode(ActionSheet, { open: true, items: ITEMS, onClose: () => {} }, ctx())!
    const panel = findVNode(vnode, (v: any) => v?.props?.class?.includes?.('wf-actionsheet-panel'))
    assert.ok(panel, '面板存在')
    assert.equal(panel.props.role, 'menu')
    const items = findByClass(vnode, 'wf-actionsheet-item')
    assert.equal(items.length, 3)
    const cancel = findByClass(vnode, 'wf-actionsheet-cancel')[0]
    assert.ok(cancel, '取消按钮存在')
    assert.equal(cancel.props.children, '取消')
  })

  it('open=false → null（不渲染）', async () => {
    const vnode = await renderVNode(ActionSheet, { open: false, items: ITEMS, onClose: () => {} }, ctx())
    assert.equal(vnode, null)
  })

  it('点击项 → onSelect(key) + onClose()', async () => {
    const sel: string[] = []
    let closed = false
    const vnode = await renderVNode(ActionSheet, {
      open: true, items: ITEMS,
      onSelect: (k: string) => sel.push(k),
      onClose: () => { closed = true },
    }, ctx())!
    const items = findByClass(vnode, 'wf-actionsheet-item')
    items[1].props.onClick()
    assert.deepEqual(sel, ['album'])
    assert.equal(closed, true, '选择后自动关闭')
  })

  it('取消按钮 → onClose', async () => {
    let closed = false
    const vnode = await renderVNode(ActionSheet, { open: true, items: ITEMS, onClose: () => { closed = true } }, ctx())!
    findByClass(vnode, 'wf-actionsheet-cancel')[0].props.onClick()
    assert.equal(closed, true)
  })

  it('danger 项 → wf-actionsheet-item--danger 类', async () => {
    const vnode = await renderVNode(ActionSheet, { open: true, items: ITEMS, onClose: () => {} }, ctx())!
    const items = findByClass(vnode, 'wf-actionsheet-item')
    assert.ok(items[2].props.class.includes('--danger'), '删除项 danger 类')
    assert.ok(!items[0].props.class.includes('--danger'))
  })

  it('disabled 项：disabled 属性 + 无 onClick', async () => {
    const items = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', disabled: true }]
    const vnode = await renderVNode(ActionSheet, { open: true, items, onClose: () => {} }, ctx())!
    const list = findByClass(vnode, 'wf-actionsheet-item')
    assert.equal(list[1].props.disabled, true)
    assert.equal(list[1].props.onClick, undefined)
  })

  it('键盘：ArrowDown/ArrowUp 移动焦点 + Enter 选择', async () => {
    const sel: string[] = []
    let closed = false
    // mountComponent：同实例（focusKey 在 mount 作用域——方向键后 Enter 必须读到最新）
    const render = await mountComponent(ActionSheet, {
      open: true, items: ITEMS,
      onSelect: (k: string) => sel.push(k),
      onClose: () => { closed = true },
    }, ctx())
    let vnode = (await render())!
    const panel = findVNode(vnode, (v: any) => v?.props?.class?.includes?.('wf-actionsheet-panel'))
    // ArrowDown：焦点 camera → album
    panel.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    // 重新渲染（内部 focusKey = album）→ Enter 应选 album
    vnode = (await render())!
    const panel2 = findVNode(vnode, (v: any) => v?.props?.class?.includes?.('wf-actionsheet-panel'))
    panel2.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.deepEqual(sel, ['album'], 'Enter 选择焦点项')
    assert.equal(closed, true)
  })

  it('overlay 点击 → onClose', async () => {
    let closed = false
    const vnode = await renderVNode(ActionSheet, { open: true, items: ITEMS, onClose: () => { closed = true } }, ctx())!
    const overlay = findByClass(vnode, 'wf-actionsheet-overlay')[0]
    overlay.props.onClick()
    assert.equal(closed, true)
  })

  it('title 渲染', async () => {
    const vnode = await renderVNode(ActionSheet, { open: true, items: ITEMS, title: '选择操作', onClose: () => {} }, ctx())!
    const title = findByClass(vnode, 'wf-actionsheet-title')[0]
    assert.ok(title, '标题存在')
    assert.equal(title.props.children, '选择操作')
  })

  it('自定义 cancelText', async () => {
    const vnode = await renderVNode(ActionSheet, { open: true, items: ITEMS, cancelText: '放弃', onClose: () => {} }, ctx())!
    const cancel = findByClass(vnode, 'wf-actionsheet-cancel')[0]
    assert.equal(cancel.props.children, '放弃')
  })
})
