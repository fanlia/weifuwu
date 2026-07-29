import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Table } from './Table.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Table', () => {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: '名称' },
  ]

  it('renders table element', () => {
    const vnode = renderVNode(Table, { columns, data: [] }, mockCtx())!
    assert.equal(vnode.type, 'table')
    assert.match(vnode.props.class, /wf-table/)
  })

  it('renders headers from columns', () => {
    const vnode = renderVNode(Table, { columns, data: [] }, mockCtx())!
    const thead = vnode.props.children[0]
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
    const tbody = vnode.props.children[1]
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
    const cell = vnode.props.children[1].props.children[0].props.children[0]
    assert.equal(cell.props.children, '★ 张三')
  })

  it('renders empty data', () => {
    const vnode = renderVNode(Table, { columns, data: [] }, mockCtx())!
    const tbody = vnode.props.children[1]
    assert.equal(tbody.props.children.length, 0)
  })

  it('shows empty text when no data', () => {
    const vnode = renderVNode(Table, { columns, data: [], emptyText: '暂无数据' }, mockCtx())!
    const tbody = vnode.props.children[1]
    const cell = tbody.props.children[0].props.children
    assert.equal(cell.props.children, '暂无数据')
  })

  it('sorts data ascending by default string compare', () => {
    const data = [{ name: '张三' }, { name: '李四' }, { name: '阿宝' }]
    const cols = [
      { key: 'name', label: '名称', sortable: true },
    ]
    const vnode = renderVNode(Table, { columns: cols, data, sortKey: 'name', sortOrder: 'asc' }, mockCtx())!
    const rows = vnode.props.children[1].props.children
    assert.equal(rows[0].props.children[0].props.children, '阿宝')
    assert.equal(rows[1].props.children[0].props.children, '李四')
    assert.equal(rows[2].props.children[0].props.children, '张三')
  })

  it('sorts data descending', () => {
    const data = [{ name: '阿宝' }, { name: '张三' }, { name: '李四' }]
    const cols = [{ key: 'name', label: '名称', sortable: true }]
    const vnode = renderVNode(Table, { columns: cols, data, sortKey: 'name', sortOrder: 'desc' }, mockCtx())!
    const rows = vnode.props.children[1].props.children
    assert.equal(rows[0].props.children[0].props.children, '张三')
    assert.equal(rows[1].props.children[0].props.children, '李四')
    assert.equal(rows[2].props.children[0].props.children, '阿宝')
  })

  it('uses custom sorter', () => {
    const data = [{ val: 10 }, { val: 5 }, { val: 20 }]
    const cols = [{ key: 'val', label: '值', sortable: true, sorter: (a: number, b: number) => a - b }]
    const vnode = renderVNode(Table, { columns: cols, data, sortKey: 'val', sortOrder: 'asc' }, mockCtx())!
    const rows = vnode.props.children[1].props.children
    assert.equal(rows[0].props.children[0].props.children, '5')
    assert.equal(rows[1].props.children[0].props.children, '10')
    assert.equal(rows[2].props.children[0].props.children, '20')
  })

  it('calls onSort when clicking sortable header', () => {
    let captured: any = null
    const cols = [{ key: 'name', label: '名称', sortable: true }]
    const vnode = renderVNode(Table, { columns: cols, data: [], onSort: (k: string, o: string) => { captured = { k, o } } }, mockCtx())!
    const headerCell = vnode.props.children[0].props.children.props.children[0]
    headerCell.props.onClick()
    assert.deepEqual(captured, { k: 'name', o: 'asc' })
  })

  it('toggles sort order on re-click', () => {
    let captured: any = null
    const cols = [{ key: 'name', label: '名称', sortable: true }]
    const vnode = renderVNode(Table, { columns: cols, data: [], sortKey: 'name', sortOrder: 'asc', onSort: (k: string, o: string) => { captured = { k, o } } }, mockCtx())!
    const headerCell = vnode.props.children[0].props.children.props.children[0]
    headerCell.props.onClick()
    assert.deepEqual(captured, { k: 'name', o: 'desc' })
  })

  it('adds sortable class to sortable headers', () => {
    const cols = [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'name', label: '名称' },
    ]
    const vnode = renderVNode(Table, { columns: cols, data: [] }, mockCtx())!
    const cells = vnode.props.children[0].props.children.props.children
    assert.match(cells[0].props.class, /wf-table-th--sortable/)
    assert.doesNotMatch(cells[1].props.class, /wf-table-th--sortable/)
  })

  it('adds sorted class to active sort column', () => {
    const cols = [{ key: 'name', label: '名称', sortable: true }]
    const vnode = renderVNode(Table, { columns: cols, data: [], sortKey: 'name', sortOrder: 'asc' }, mockCtx())!
    const cell = vnode.props.children[0].props.children.props.children[0]
    assert.match(cell.props.class, /wf-table-th--sorted/)
  })
})
