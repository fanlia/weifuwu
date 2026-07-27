import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Table } from './Table.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Table', () => {
  const columns = [
    { key: 'id', label: 'ID' },
    { key: 'name', label: '名称' },
  ]

  it('renders table element', () => {
    const vnode = Table({ columns, data: [] }, mockCtx())!
    assert.equal(vnode.type, 'table')
    assert.match(vnode.props.class, /wf-table/)
  })

  it('renders headers from columns', () => {
    const vnode = Table({ columns, data: [] }, mockCtx())!
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
    const vnode = Table({ columns, data }, mockCtx())!
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
    const vnode = Table({ columns: cols, data }, mockCtx())!
    const cell = vnode.props.children[1].props.children[0].props.children[0]
    // cell is a td element, its children is the rendered content
    assert.equal(cell.props.children, '★ 张三')
  })

  it('renders empty data', () => {
    const vnode = Table({ columns, data: [] }, mockCtx())!
    const tbody = vnode.props.children[1]
    assert.equal(tbody.props.children.length, 0)
  })
})
