import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Command } from './Command.ts'
import { Portal } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createPopupMock } from '../../ui-dom/testing.ts'

// 捕获 useGlobalKey 注册的 handler（测试直接触发）
const globalKeys: ((e: any) => void)[] = []
function createTestCtx(): WfuiContext {
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    useGlobalKey: (h: any) => { globalKeys.push(h); return () => {} },
    // usePopup mask 模式统一（createPopupMock：open getter + setOpen 转发 + portal 条件渲染）
    usePopup: (opts: any) => createPopupMock(() => opts.isOpen(), opts.setOpen),
  } } as any
}


const inner = (v: any) => v?.type === Portal ? v.props.children : v

/** v → panel（mock portal 直接返回 panel；真实 usePopup portal 是 Portal 包装） */
const panelOfCmd = (v: any) => {
  let n = v
  if (n?.type === Portal) n = n.props.children
  return n?.props?.class?.includes('wf-command-panel') ? n : (n?.props?.children ?? n)
}

/** panel → 搜索输入框 */
const inputOf = (v: any) => {
  const panel = panelOfCmd(v)
  return panel.props.children[0].props.children[1]
}

const items = [
  { key: 'new', label: '新建聊天', shortcut: 'N' },
  { key: 'search', label: '搜索', shortcut: 'S' },
  { key: 'settings', label: '设置', shortcut: 'G S' },
]

describe('Command', () => {
  it('closed renders null（usePopup portal 只在 open 渲染；快捷键监听在 mount 注册）', async () => {
    const vnode = await renderVNode(Command, { items, open: false }, createTestCtx())
    assert.equal(vnode, null)
  })

  it('renders panel when open', async () => {
    const vnode = await inner(await renderVNode(Command, { items, open: true }, createTestCtx())!)
    // usePopup mask 统一后 portal 返回 panel（遮罩在真实引擎，mock 只验 panel 结构）
    assert.ok(vnode)
    assert.match(JSON.stringify(vnode.props.class ?? ''), /wf-command-panel/)
  })

  it('renders all items', async () => {
    const vnode = await renderVNode(Command, { items, open: true }, createTestCtx())!
    const panel = panelOfCmd(inner(vnode))
    assert.match(panel.props.class, /wf-command-panel/)
    const list = panel.props.children[1] // [input-wrap, list]
    assert.equal(list.props.children.length, 3)
  })

  it('filters items by query', async () => {
    const ctx = createTestCtx()
    const render = await Command({ items, open: true }, ctx)
    const r = render as any
    const v1 = await r({ items, open: true })
    inputOf(v1).props.onInput({ target: { value: '设置' } })
    const v2 = await r({ items, open: true })
    const list = panelOfCmd(v2).props.children[1].props.children
    assert.equal(list.length, 1)
    assert.equal(list[0].props.children[1].props.children, '设置')
  })

  it('ArrowDown highlights, Enter selects', async () => {
    let selected: string | null = null
    const myItems = [
      { key: 'a', label: 'A', onSelect: () => { selected = 'a' } },
      { key: 'b', label: 'B', onSelect: () => { selected = 'b' } },
    ]
    const ctx = createTestCtx()
    const render = await Command({ items: myItems, open: true }, ctx)
    const r = render as any
    r({ items: myItems, open: true })
    const v = await r({ items: myItems, open: true })
    const input = inputOf(v)
    input.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    input.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.equal(selected, 'b')
  })

  it('Escape triggers onOpenChange(false)', async () => {
    let closed = false
    const ctx = createTestCtx()
    const render = await Command({ items, open: true, onOpenChange: (o: boolean) => { closed = !o } }, ctx)
    const r = render as any
    const v = await r({ items, open: true, onOpenChange: (o: boolean) => { closed = !o } })
    inputOf(v).props.onKeyDown({ key: 'Escape' })
    assert.equal(closed, true)
  })

  it('renders empty text when no match', async () => {
    const ctx = createTestCtx()
    const render = await Command({ items, open: true, emptyText: '无结果' }, ctx)
    const r = render as any
    const v1 = await r({ items, open: true, emptyText: '无结果' })
    inputOf(v1).props.onInput({ target: { value: 'zzz' } })
    const v2 = await r({ items, open: true, emptyText: '无结果' })
    const list = panelOfCmd(v2).props.children[1].props.children
    assert.equal(list[0].props.children, '无结果')
  })

  it('global shortcut mod+k opens', async () => {
    let opened: boolean | null = null
    const ctx = createTestCtx()
    const render = await Command({ items, open: false, onOpenChange: (o: boolean) => { opened = o } }, ctx)
    const r = render as any
    const v = await r({ items, open: false, onOpenChange: (o: boolean) => { opened = o } })
    void v
    // useGlobalKey 注册的 handler 直接触发（mod+k → ctrlKey+k）
    globalKeys.at(-1)?.(new (window as any).KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    assert.equal(opened, true)
  })
})
