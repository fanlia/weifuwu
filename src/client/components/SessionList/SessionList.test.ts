import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SessionList, type Session } from './SessionList.ts'
import { renderVNode, mountComponent, findByClass, createTestCtx } from '../../ui-dom/testing.ts'

const now = Date.now()
const day = 24 * 3600 * 1000
// 分组基准：今天 00:00（s1 用「今天中午」——任何时刻执行都稳定落在「今天」组；
// 原 now-1h 在 00:00-01:00 执行时落「昨天」——测试跨午夜脆弱性）
const todayStart = new Date(now).setHours(0, 0, 0, 0)
const sessions: Session[] = [
  { id: 's1', title: '今天的话题', updatedAt: todayStart + 12 * 3600 * 1000 },
  { id: 's2', title: '昨天的讨论', updatedAt: todayStart - 1 - 3600 * 1000 },
  { id: 's3', title: '上周的调研', updatedAt: todayStart - 3 * day },
  { id: 's4', title: '很久以前', updatedAt: todayStart - 30 * day },
]

describe('SessionList', () => {
  it('渲染会话 + 时间分组（今天/昨天/更早）', async () => {
    const v = await renderVNode(SessionList, { sessions }, createTestCtx())!
    const groups = findByClass(v, 'wf-session-group-title')
    const labels = groups.map((g: any) => g.props.children)
    assert.ok(labels.includes('今天'), `分组缺今天: ${labels.join(',')}`)
    assert.ok(labels.includes('昨天'), '分组缺昨天')
    assert.ok(labels.includes('更早'), '分组缺更早')
    const rows = findByClass(v, 'wf-session-item')
    assert.equal(rows.length, 4)
  })

  it('activeId → 高亮 class + aria-selected', async () => {
    const v = await renderVNode(SessionList, { sessions, activeId: 's2' }, createTestCtx())!
    const rows = findByClass(v, 'wf-session-item')
    const s2 = rows.find((r: any) => r.props['data-id'] === 's2')
    assert.ok(String(s2.props.class).includes('--active'), '高亮')
    assert.equal(s2.props['aria-selected'], 'true')
    const s1 = rows.find((r: any) => r.props['data-id'] === 's1')
    assert.ok(!String(s1.props.class).includes('--active'))
  })

  it('点击会话 → onSelect(id)', async () => {
    let selected: string | undefined
    const v = await renderVNode(SessionList, { sessions, onSelect: (id: string) => { selected = id } }, createTestCtx())!
    const rows = findByClass(v, 'wf-session-item')
    rows[1].props.onClick()
    assert.equal(selected, 's2')
  })

  it('悬停删除按钮 → onDelete(id)', async () => {
    let deleted: string | undefined
    const v = await renderVNode(SessionList, { sessions, onDelete: (id: string) => { deleted = id } }, createTestCtx())!
    const delBtns = findByClass(v, 'wf-session-del')
    assert.equal(delBtns.length, 4, '每行删除按钮')
    delBtns[0].props.onClick({ stopPropagation: () => {} })
    assert.equal(deleted, 's1')
  })

  it('重命名：编辑按钮 → 行内输入 → Enter → onRename(id, title)', async () => {
    let renamed: { id: string; title: string } | undefined
    const ctx = createTestCtx()
    const props = { sessions, onRename: (id: string, title: string) => { renamed = { id, title } } }
    const render = await mountComponent(SessionList, props, ctx)
    let v = await render()
    const editBtns = findByClass(v, 'wf-session-rename')
    editBtns[0].props.onClick({ stopPropagation: () => {} })
    v = await render()
    const input = findByClass(v, 'wf-session-rename-input')[0]
    assert.ok(input, '重命名输入框')
    assert.equal(input.props.value, '今天的话题', '预填原标题')
    input.props.onInput({ target: { value: '改后的标题' } })
    input.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.ok(renamed && renamed.id === 's1' && renamed.title === '改后的标题')
  })

  it('重命名 Escape 取消（不触发 onRename）', async () => {
    let renamed = false
    const ctx = createTestCtx()
    const props = { sessions, onRename: () => { renamed = true } }
    const render = await mountComponent(SessionList, props, ctx)
    let v = await render()
    findByClass(v, 'wf-session-rename')[0].props.onClick({ stopPropagation: () => {} })
    v = await render()
    findByClass(v, 'wf-session-rename-input')[0].props.onKeyDown({ key: 'Escape', preventDefault: () => {} })
    assert.equal(renamed, false)
    v = await render()
    assert.equal(findByClass(v, 'wf-session-rename-input').length, 0, '输入框收起')
  })

  it('搜索过滤（searchable）：按标题匹配', async () => {
    const ctx = createTestCtx()
    const props = { sessions, searchable: true }
    const render = await mountComponent(SessionList, props, ctx)
    let v = await render()
    const search = findByClass(v, 'wf-session-search')[0]
    assert.ok(search, '搜索框')
    search.props.onInput({ target: { value: '昨天' } })
    v = await render()
    const rows = findByClass(v, 'wf-session-item')
    assert.equal(rows.length, 1)
    assert.ok(JSON.stringify(rows[0].props.children).includes('昨天'))
  })

  it('新建按钮 → onNew', async () => {
    let clicked = false
    const v = await renderVNode(SessionList, { sessions, onNew: () => { clicked = true } }, createTestCtx())!
    const btn = findByClass(v, 'wf-session-new')[0]
    assert.ok(btn)
    btn.props.onClick()
    assert.equal(clicked, true)
  })

  it('键盘：方向键移动选中 + Enter 激活', async () => {
    let selected: string | undefined
    const ctx = createTestCtx()
    const props = { sessions, activeId: 's1', onSelect: (id: string) => { selected = id } }
    const render = await mountComponent(SessionList, props, ctx)
    let v = await render()
    const list = findByClass(v, 'wf-session-list')[0]
    // ArrowDown：s1 → s2（焦点移动，--focus 视觉）
    list.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    v = await render()
    const rows = findByClass(v, 'wf-session-item')
    const focused = rows.find((r: any) => String(r.props.class).includes('--focus'))
    assert.equal(focused.props['data-id'], 's2', '焦点下移')
    // Enter 激活：focused 行 onKeyDown → onSelect
    focused.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.equal(selected, 's2')
  })

  it('空列表 → 空态提示', async () => {
    const v = await renderVNode(SessionList, { sessions: [] }, createTestCtx())!
    const empty = findByClass(v, 'wf-session-empty')
    assert.equal(empty.length, 1)
  })
})
