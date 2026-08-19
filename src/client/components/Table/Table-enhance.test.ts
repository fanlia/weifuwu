import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Table } from './Table.ts'
import { renderVNode } from '../../vdom/testing.ts'
import type { UIContext } from '../../vdom/index.ts'


function mockCtx(){
  return { render: async () => {}, onUnmount: () => {}, params: {}, query: {},
    ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

const columns = [
  { key: 'name', label: '名称' },
  { key: 'age', label: '年龄' },
]

const data = [
  { id: 1, name: '张三', age: 30 },
  { id: 2, name: '李四', age: 25 },
  { id: 3, name: '王五', age: 35 },
]

describe('Table 行选择增强', () => {
  // 结构：wrap > table > thead/tbody；th/td > input（checkbox）
  const headSel = (vnode: any) => {
    const thead = vnode.props.children.props.children[0]
    const th = thead.props.children.props.children[0]
    return th.props.children
  }
  const rowSel = (vnode: any, i: number) => {
    const tbody = vnode.props.children.props.children[1]
    const row = tbody.props.children[i] // tbody.children = rows 数组
    return row.props.children[0].props.children
  }

  it('renders selection column when rowSelection provided', async () => {
    const vnode = await renderVNode(Table, { data, columns, rowSelection: { selectedRowKeys: [] } }, mockCtx())!
    const thead = vnode.props.children.props.children[0]
    const ths = thead.props.children.props.children
    assert.match(ths[0].props.class, /--selection/)
    assert.equal(ths.length, 3) // checkbox + 2 columns
  })

  it('no selection column without rowSelection', async () => {
    const vnode = await renderVNode(Table, { data, columns }, mockCtx())!
    const thead = vnode.props.children.props.children[0]
    const ths = thead.props.children.props.children
    assert.equal(ths.length, 2)
  })

  it('row checkbox checked for selected keys', async () => {
    const vnode = await renderVNode(Table, { data, columns, rowSelection: { selectedRowKeys: [1, 3] } }, mockCtx())!
    assert.equal(rowSel(vnode, 0).props.checked, true)
    assert.equal(rowSel(vnode, 1).props.checked, undefined)
    assert.equal(rowSel(vnode, 2).props.checked, true)
  })

  it('clicking row checkbox calls onChange with new keys', async () => {
    let got: (string | number)[] = []
    const vnode = await renderVNode(Table, {
      data, columns,
      rowSelection: { selectedRowKeys: [1], onChange: (k: (string | number)[]) => { got = k } },
    }, mockCtx())!
    rowSel(vnode, 1).props.onChange() // 选李四
    assert.deepEqual(got, [1, 2])
  })

  it('unchecking row removes key', async () => {
    let got: (string | number)[] = [1, 2]
    const vnode = await renderVNode(Table, {
      data, columns,
      rowSelection: { selectedRowKeys: [1, 2], onChange: (k: (string | number)[]) => { got = k } },
    }, mockCtx())!
    rowSel(vnode, 0).props.onChange() // 取消张三
    assert.deepEqual(got, [2])
  })

  it('select-all checkbox checks all', async () => {
    let got: (string | number)[] = []
    const vnode = await renderVNode(Table, {
      data, columns,
      rowSelection: { selectedRowKeys: [], onChange: (k: (string | number)[]) => { got = k } },
    }, mockCtx())!
    headSel(vnode).props.onChange()
    assert.deepEqual(got, [1, 2, 3])
  })

  it('select-all unchecks when all selected', async () => {
    let got: (string | number)[] = [1, 2, 3]
    const vnode = await renderVNode(Table, {
      data, columns,
      rowSelection: { selectedRowKeys: [1, 2, 3], onChange: (k: (string | number)[]) => { got = k } },
    }, mockCtx())!
    headSel(vnode).props.onChange()
    assert.deepEqual(got, [])
  })

  it('uses custom rowKey', async () => {
    const customData = [{ uid: 'a', name: 'A' }, { uid: 'b', name: 'B' }]
    const vnode = await renderVNode(Table, {
      data: customData, columns: [{ key: 'name', label: '名称' }],
      rowSelection: { rowKey: 'uid', selectedRowKeys: ['a'] },
    }, mockCtx())!
    assert.equal(rowSel(vnode, 0).props.checked, true)
    assert.equal(rowSel(vnode, 1).props.checked, undefined)
  })

  it('indeterminate on partial selection', async () => {
    const vnode = await renderVNode(Table, {
      data, columns,
      rowSelection: { selectedRowKeys: [1] },
    }, mockCtx())!
    assert.equal(headSel(vnode).props.indeterminate, 'true')
  })
})
