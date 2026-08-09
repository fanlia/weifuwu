import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Command } from './Command.ts'
import { Portal } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

// 捕获 useGlobalKey 注册的 handler（测试直接触发）
const globalKeys: ((e: any) => void)[] = []
function mockCtx(): WfuiContext {
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    useGlobalKey: (h: any) => { globalKeys.push(h); return () => {} },
  } } as any
}

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

/** v(overlay) → panel：Portal > overlay > panel */
const panelOfCmd = (v: any) => v.props.children.props.children

/** panel → 搜索输入框 */
const inputOf = (v: any) => panelOfCmd(v).props.children[0].props.children[1]

const items = [
  { key: 'new', label: '新建聊天', shortcut: 'N' },
  { key: 'search', label: '搜索', shortcut: 'S' },
  { key: 'settings', label: '设置', shortcut: 'G S' },
]

describe('Command', () => {
  it('closed renders hidden host（保持全局快捷键监听）', () => {
    const vnode = renderVNode(Command, { items, open: false }, mockCtx())
    assert.ok(vnode)
    assert.match(vnode.props.class, /wf-command-host/)
  })

  it('renders panel when open', () => {
    const vnode = inner(renderVNode(Command, { items, open: true }, mockCtx())!)
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-command-overlay/)
  })

  it('renders all items', () => {
    const vnode = inner(renderVNode(Command, { items, open: true }, mockCtx())!)
    const panel = vnode.props.children // overlay 直接子 = panel
    assert.match(panel.props.class, /wf-command-panel/)
    const list = panel.props.children[1] // [input-wrap, list]
    assert.equal(list.props.children.length, 3)
  })

  it('filters items by query', () => {
    const ctx = mockCtx()
    const render = Command({ items, open: true }, ctx)
    const r = render as any
    const v1 = r({ items, open: true })
    inputOf(v1).props.onInput({ target: { value: '设置' } })
    const v2 = r({ items, open: true })
    const list = panelOfCmd(v2).props.children[1].props.children
    assert.equal(list.length, 1)
    assert.equal(list[0].props.children[1].props.children, '设置')
  })

  it('ArrowDown highlights, Enter selects', () => {
    let selected: string | null = null
    const myItems = [
      { key: 'a', label: 'A', onSelect: () => { selected = 'a' } },
      { key: 'b', label: 'B', onSelect: () => { selected = 'b' } },
    ]
    const ctx = mockCtx()
    const render = Command({ items: myItems, open: true }, ctx)
    const r = render as any
    r({ items: myItems, open: true })
    const v = r({ items: myItems, open: true })
    const input = inputOf(v)
    input.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    input.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.equal(selected, 'b')
  })

  it('Escape triggers onOpenChange(false)', () => {
    let closed = false
    const ctx = mockCtx()
    const render = Command({ items, open: true, onOpenChange: (o: boolean) => { closed = !o } }, ctx)
    const r = render as any
    const v = r({ items, open: true, onOpenChange: (o: boolean) => { closed = !o } })
    inputOf(v).props.onKeyDown({ key: 'Escape' })
    assert.equal(closed, true)
  })

  it('renders empty text when no match', () => {
    const ctx = mockCtx()
    const render = Command({ items, open: true, emptyText: '无结果' }, ctx)
    const r = render as any
    const v1 = r({ items, open: true, emptyText: '无结果' })
    inputOf(v1).props.onInput({ target: { value: 'zzz' } })
    const v2 = r({ items, open: true, emptyText: '无结果' })
    const list = panelOfCmd(v2).props.children[1].props.children
    assert.equal(list[0].props.children, '无结果')
  })

  it('global shortcut mod+k opens', () => {
    let opened: boolean | null = null
    const ctx = mockCtx()
    const render = Command({ items, open: false, onOpenChange: (o: boolean) => { opened = o } }, ctx)
    const r = render as any
    const v = r({ items, open: false, onOpenChange: (o: boolean) => { opened = o } })
    void v
    // useGlobalKey 注册的 handler 直接触发（mod+k → ctrlKey+k）
    globalKeys.at(-1)?.(new (window as any).KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))
    assert.equal(opened, true)
  })
})
