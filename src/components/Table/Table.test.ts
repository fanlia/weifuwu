import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Table } from './Table.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true } } as any
}

/** Table 现在包在 .wf-table-wrap 滚动容器里，取内层 table VNode */
function tableOf(root: any): any {
  assert.equal(root.type, 'div')
  assert.match(root.props.class, /wf-table-wrap/)
  const children = Array.isArray(root.props.children) ? root.props.children : [root.props.children]
  return children[0]
}

describe('Table', () => {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: '名称' },
  ]

  it('renders table element', () => {
    const vnode = renderVNode(Table, { columns, data: [] }, mockCtx())!
    const table = tableOf(vnode)
    assert.equal(table.type, 'table')
    assert.match(table.props.class, /wf-table/)
  })

  it('renders headers from columns', () => {
    const vnode = renderVNode(Table, { columns, data: [] }, mockCtx())!
    const table = tableOf(vnode)
    const thead = table.props.children[0]
    assert.equal(thead.type, 'thead')
    const headerCells = thead.props.children.props.children
    assert.equal(headerCells.length, 2)
    assert.equal(headerCells[0].props.children, 'ID')
    assert.equal(headerCells[1].props.children, '名称')
  })

  it('renders data rows', () => {
    const data = [
      { id: 1, name: '张三' },
      { id: 2, name: '李四' },
    ]
    const vnode = renderVNode(Table, { columns, data }, mockCtx())!
    const table = tableOf(vnode)
    const tbody = table.props.children[1]
    assert.equal(tbody.type, 'tbody')
    const rows = tbody.props.children
    assert.equal(rows.length, 2)
    assert.equal(rows[0].props.children[0].props.children, '1')
    assert.equal(rows[0].props.children[1].props.children, '张三')
  })

  it('uses custom render function', () => {
    const cols = [
      { key: 'name', label: '名称', render: (v: string) => `★ ${v}` },
    ]
    const data = [{ name: '张三' }]
    const vnode = renderVNode(Table, { columns: cols, data }, mockCtx())!
    const table = tableOf(vnode)
    const cell = table.props.children[1].props.children[0].props.children[0]
    assert.equal(cell.props.children, '★ 张三')
  })

  it('renders empty data', () => {
    const vnode = renderVNode(Table, { columns, data: [] }, mockCtx())!
    const tbody = tableOf(vnode).props.children[1]
    assert.equal(tbody.props.children.length, 0)
  })

  it('shows empty text when no data', () => {
    const vnode = renderVNode(Table, { columns, data: [], emptyText: '暂无数据' }, mockCtx())!
    const tbody = tableOf(vnode).props.children[1]
    const cell = tbody.props.children[0].props.children
    assert.equal(cell.props.children, '暂无数据')
  })

  it('sorts data ascending by default string compare', () => {
    const data = [{ name: '张三' }, { name: '李四' }, { name: '阿宝' }]
    const cols = [
      { key: 'name', label: '名称', sortable: true },
    ]
    const vnode = renderVNode(Table, { columns: cols, data, sortKey: 'name', sortOrder: 'asc' }, mockCtx())!
    const rows = tableOf(vnode).props.children[1].props.children
    assert.equal(rows[0].props.children[0].props.children, '阿宝')
    assert.equal(rows[1].props.children[0].props.children, '李四')
    assert.equal(rows[2].props.children[0].props.children, '张三')
  })

  it('sorts data descending', () => {
    const data = [{ name: '阿宝' }, { name: '张三' }, { name: '李四' }]
    const cols = [{ key: 'name', label: '名称', sortable: true }]
    const vnode = renderVNode(Table, { columns: cols, data, sortKey: 'name', sortOrder: 'desc' }, mockCtx())!
    const rows = tableOf(vnode).props.children[1].props.children
    assert.equal(rows[0].props.children[0].props.children, '张三')
    assert.equal(rows[1].props.children[0].props.children, '李四')
    assert.equal(rows[2].props.children[0].props.children, '阿宝')
  })

  it('uses custom sorter', () => {
    const data = [{ val: 10 }, { val: 5 }, { val: 20 }]
    const cols = [{ key: 'val', label: '值', sortable: true, sorter: (a: number, b: number) => a - b }]
    const vnode = renderVNode(Table, { columns: cols, data, sortKey: 'val', sortOrder: 'asc' }, mockCtx())!
    const rows = tableOf(vnode).props.children[1].props.children
    assert.equal(rows[0].props.children[0].props.children, '5')
    assert.equal(rows[1].props.children[0].props.children, '10')
    assert.equal(rows[2].props.children[0].props.children, '20')
  })

  it('calls onSort when clicking sortable header', () => {
    let captured: any = null
    const cols = [{ key: 'name', label: '名称', sortable: true }]
    const vnode = renderVNode(Table, { columns: cols, data: [], onSort: (k: string, o: string) => { captured = { k, o } } }, mockCtx())!
    const headerCell = tableOf(vnode).props.children[0].props.children.props.children[0]
    headerCell.props.onClick()
    assert.deepEqual(captured, { k: 'name', o: 'asc' })
  })

  it('toggles sort order on re-click', () => {
    let captured: any = null
    const cols = [{ key: 'name', label: '名称', sortable: true }]
    const vnode = renderVNode(Table, { columns: cols, data: [], sortKey: 'name', sortOrder: 'asc', onSort: (k: string, o: string) => { captured = { k, o } } }, mockCtx())!
    const headerCell = tableOf(vnode).props.children[0].props.children.props.children[0]
    headerCell.props.onClick()
    assert.deepEqual(captured, { k: 'name', o: 'desc' })
  })

  it('adds sortable class to sortable headers', () => {
    const cols = [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'name', label: '名称' },
    ]
    const vnode = renderVNode(Table, { columns: cols, data: [] }, mockCtx())!
    const cells = tableOf(vnode).props.children[0].props.children.props.children
    assert.match(cells[0].props.class, /wf-table-th--sortable/)
    assert.doesNotMatch(cells[1].props.class, /wf-table-th--sortable/)
  })

  it('adds sorted class to active sort column', () => {
    const cols = [{ key: 'name', label: '名称', sortable: true }]
    const vnode = renderVNode(Table, { columns: cols, data: [], sortKey: 'name', sortOrder: 'asc' }, mockCtx())!
    const cell = tableOf(vnode).props.children[0].props.children.props.children[0]
    assert.match(cell.props.class, /wf-table-th--sorted/)
  })

  it('passes minWidth to table for responsive scroll', () => {
    const vnode = renderVNode(Table, { columns, data: [], minWidth: '720px' }, mockCtx())!
    const table = tableOf(vnode)
    assert.equal(table.props.style.minWidth, '720px')
    // 未设置 minWidth 时不输出 style
    const vnode2 = renderVNode(Table, { columns, data: [] }, mockCtx())!
    assert.equal(tableOf(vnode2).props.style, undefined)
  })

  it('loading 时保留表头并渲染骨架行', () => {
    const vnode = renderVNode(Table, { columns, data: [], loading: true }, mockCtx())!
    const table = tableOf(vnode)
    const thead = table.props.children[0]
    const tbody = table.props.children[1]
    assert.equal(thead.type, 'thead', '加载中保留表头')
    const rows = tbody.props.children
    assert.equal(rows.length, 3, '默认 3 行骨架')
    const firstCell = rows[0].props.children[0]
    assert.match(firstCell.props.children.props.class, /wf-skeleton/)
    // 自定义骨架行数
    const vnode2 = renderVNode(Table, { columns, data: [], loading: true, loadingRows: 5 }, mockCtx())!
    assert.equal(tableOf(vnode2).props.children[1].props.children.length, 5)
  })

  it('可排序表头键盘 Enter/Space 触发排序（可聚焦不可操作红线）', () => {
    const cols = [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'name', label: '名称' },
    ]
    let called: [string, string] | null = null
    // 首次渲染：无排序状态
    const vnode = renderVNode(Table, {
      columns: cols, data: [],
      onSort: (k: string, o: string) => { called = [k, o] },
    }, mockCtx())!
    const headerCells = tableOf(vnode).props.children[0].props.children.props.children
    const sortable = headerCells[0]
    const plain = headerCells[1]
    // 可排序：有键盘处理；不可排序：无
    assert.equal(typeof sortable.props.onKeyDown, 'function')
    assert.equal(plain.props.onKeyDown, undefined)
    // Enter → asc（初始无排序）
    sortable.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.deepEqual(called, ['id', 'asc'])
    // 模拟父组件收到 onSort 后重渲染（sortKey/sortOrder 已更新）→ 再按 Space → desc
    const vnode2 = renderVNode(Table, {
      columns: cols, data: [], sortKey: 'id', sortOrder: 'asc',
      onSort: (k: string, o: string) => { called = [k, o] },
    }, mockCtx())!
    const sortable2 = tableOf(vnode2).props.children[0].props.children.props.children[0]
    sortable2.props.onKeyDown({ key: ' ', preventDefault: () => {} })
    assert.deepEqual(called, ['id', 'desc'])
  })
})
