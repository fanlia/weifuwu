import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { VirtualTable } from './VirtualTable.ts'
import type { WfuiContext } from '../../client/types.ts'

// 可控 useScrollPosition mock（VirtualList 同款）
function mockCtx(scrollY = 0): { ctx: WfuiContext; setY: (y: number) => void } {
  const scroll = { y: scrollY, refresh: () => {} }
  const ctx = { ui: { $: {}, render: () => {}, dirty: () => {}, useScrollPosition: () => scroll, ready: true } } as any
  return { ctx, setY: (y: number) => { scroll.y = y } }
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const columns = [
  { key: 'id', label: 'ID', width: 60, sortable: true },
  { key: 'name', label: '姓名', sortable: true },
  { key: 'role', label: '角色', render: (v: string) => ({ type: 'span' as const, props: { class: 'role-badge' }, children: v }) },
]

const rows = Array.from({ length: 10000 }, (_, i) => ({ id: i, name: `用户${i}`, role: i % 2 ? 'admin' : 'user' }))

describe('VirtualTable', () => {
  it('渲染固定表头 + 只渲染可见窗口行（10k 行 → < 20 行 VNode）', () => {
    const render = mount(VirtualTable, { columns, data: rows }, mockCtx().ctx)!
    const v = render({ columns, data: rows })
    const thead = v.props.children[0]
    assert.match(thead.props.class, /wf-virtual-table-thead/)
    const ths = thead.props.children.filter((c: any) => c?.props?.class?.includes('wf-virtual-table-th'))
    assert.equal(ths.length, 3)
    // body 内 row 数 = 可见窗口（400/40=10 + overscan）
    const body = v.props.children[1]
    const rows_ = body.props.children.filter((c: any) => c?.props?.class?.includes('wf-virtual-table-row'))
    assert.ok(rows_.length < 20, `应只渲染可见窗口，实际 ${rows_.length}`)
    assert.ok(rows_.length >= 10, `至少渲染视口内行，实际 ${rows_.length}`)
  })

  it('行单元格渲染 columns cells + render 自定义', () => {
    const render = mount(VirtualTable, { columns, data: rows }, mockCtx().ctx)!
    const v = render({ columns, data: rows })
    const body = v.props.children[1]
    const row0 = body.props.children.filter((c: any) => c?.props?.class?.includes('wf-virtual-table-row'))[0]
    const cells = row0.props.children.filter((c: any) => c?.props?.class?.includes('wf-virtual-table-td'))
    assert.equal(cells.length, 3)
    // 自定义 render：role 列是 span.badge
    assert.equal(cells[2].props.children.type, 'span')
    assert.match(cells[2].props.children.props.class, /role-badge/)
  })

  it('滚动后可见窗口更新（setY → 新窗口）', () => {
    const { ctx, setY } = mockCtx()
    const render = mount(VirtualTable, { columns, data: rows }, ctx)!
    setY(4000) // 第 100 行附近
    const v = render({ columns, data: rows })
    const body = v.props.children[1]
    const firstRow = body.props.children.filter((c: any) => c?.props?.class?.includes('wf-virtual-table-row'))[0]
    // 首行 top = 起点行 index(95) × 40 = 3800px（overscan 从 95 行起渲染）
    assert.match(firstRow.props.style.top, /3800px/)
  })

  it('表头排序点击 → onSort 回调', () => {
    let got: [string, string] | null = null
    const render = mount(VirtualTable, {
      columns, data: rows,
      onSort: (k: string, o: 'asc' | 'desc') => { got = [k, o] },
    }, mockCtx().ctx)!
    const v = render({ columns, data: rows, onSort: (k: string, o: 'asc' | 'desc') => { got = [k, o] } })
    const ths = v.props.children[0].props.children.filter((c: any) => c?.props?.class?.includes('wf-virtual-table-th'))
    const nameTh = ths.find((c: any) => c.props.children[0].props.children === '姓名')
    nameTh.props.onClick()
    assert.deepEqual(got, ['name', 'asc'])
  })

  it('受控排序：sortKey 升序后首行正确 + 排序图标激活', () => {
    const render = mount(VirtualTable, { columns, data: rows, sortKey: 'id', sortOrder: 'desc' }, mockCtx().ctx)!
    const v = render({ columns, data: rows, sortKey: 'id', sortOrder: 'desc' })
    const ths = v.props.children[0].props.children.filter((c: any) => c?.props?.class?.includes('wf-virtual-table-th'))
    const idTh = ths[0]
    assert.match(idTh.props.class, /wf-virtual-table-th--sorted/)
    const body = v.props.children[1]
    const row0 = body.props.children.filter((c: any) => c?.props?.class?.includes('wf-virtual-table-row'))[0]
    const idCell = row0.props.children[0]
    assert.equal(idCell.props.children, '9999') // desc → 最大 id 在前（单元格 String 化）
  })

  it('空数据渲染 emptyText', () => {
    const render = mount(VirtualTable, { columns, data: [], emptyText: '暂无数据' }, mockCtx().ctx)!
    const v = render({ columns, data: [], emptyText: '暂无数据' })
    const texts = collectText(v)
    assert.ok(texts.includes('暂无数据'))
  })
})

function collectText(n: any): string[] {
  const out: string[] = []
  const walk = (x: any) => {
    if (x == null || typeof x === 'boolean') return
    if (typeof x === 'string' || typeof x === 'number') { out.push(String(x)); return }
    if (Array.isArray(x)) { x.forEach(walk); return }
    if (x.props?.children != null) walk(x.props.children)
  }
  walk(n)
  return out
}

it('受控排序对称：sortKey + onSort（点击切换方向）', () => {
  let sortArgs: any
  const { ctx } = mockCtx()
  const factory = mount(VirtualTable, { columns, data: rows.slice(0, 5), sortKey: 'id', sortOrder: 'asc', onSort: (k: string, o: string) => { sortArgs = [k, o] } }, ctx)
  const vnode = factory({ columns, data: rows.slice(0, 5), sortKey: 'id', sortOrder: 'asc', onSort: (k: string, o: string) => { sortArgs = [k, o] } })
  const find = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (n.props?.onClick && /th|sort/.test(String(n.props?.class ?? ''))) return n
    const k = n.props?.children
    if (Array.isArray(k)) for (const c of k) { const f = find(c); if (f) return f }
    return null
  }
  const th = find(vnode)
  assert.ok(th, '排序表头存在')
  th.props.onClick()
  assert.deepEqual(sortArgs, ['id', 'desc'], 'asc 后点击切 desc')
})

it('rowHeight/height 控制窗口行数（小视口少渲染）', () => {
  const { ctx } = mockCtx()
  const factory = mount(VirtualTable, { columns, data: rows, height: 120, rowHeight: 40 }, ctx)
  const vnode = factory({ columns, data: rows, height: 120, rowHeight: 40 })
  const rowCount = (JSON.stringify(vnode).match(/"id":/g) || []).length
  assert.ok(rowCount < 30, `小视口只渲染少量行（实际 ${rowCount}）`)
})

it('rowSelection：全选复选框 + 单行选择 onChange', () => {
  let sel: any[] = []
  const selRows: any[] = []
  const { ctx } = mockCtx()
  const factory = mount(VirtualTable, {
    columns, data: rows.slice(0, 5),
    rowSelection: { selectedRowKeys: [], onChange: (k: any[], r: any[]) => { sel = k; selRows.length = 0; selRows.push(...r) } },
  }, ctx)
  const vnode = factory({
    columns, data: rows.slice(0, 5),
    rowSelection: { selectedRowKeys: [], onChange: (k: any[], r: any[]) => { sel = k; selRows.length = 0; selRows.push(...r) } },
  })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-virtual-table-check'), '复选框列渲染')
  assert.ok(s.includes('全选'), '全选 aria-label')
  // 找全选 checkbox（表头）
  const find = (n: any): any => {
    if (!n || typeof n !== 'object') return null
    if (n.type === 'input' && n.props?.type === 'checkbox' && n.props?.['aria-label'] === '全选') return n
    const k = n.props?.children
    const arr = Array.isArray(k) ? k : (k && typeof k === 'object' ? [k] : [])
    for (const c of arr) { const f = find(c); if (f) return f }
    return null
  }
  const allCheck = find(vnode)
  assert.ok(allCheck, '全选 checkbox 存在')
  allCheck.props.onChange()
  assert.equal(sel.length, 5, '全选 → 5 行选中')
})

it('rowSelection：单行勾选 toggle', () => {
  let sel: any[] = [0]
  const { ctx } = mockCtx()
  const factory = mount(VirtualTable, {
    columns, data: rows.slice(0, 3),
    rowSelection: { selectedRowKeys: sel, onChange: (k: any[]) => { sel = k } },
  }, ctx)
  const vnode = factory({
    columns, data: rows.slice(0, 3),
    rowSelection: { selectedRowKeys: sel, onChange: (k: any[]) => { sel = k } },
  })
  // 找单行 checkbox（aria-label 含"选择第"）
  const findAll = (n: any, acc: any[] = []): any[] => {
    if (!n || typeof n !== 'object') return acc
    if (n.type === 'input' && n.props?.type === 'checkbox' && /选择第/.test(n.props?.['aria-label'] ?? '')) acc.push(n)
    const k = n.props?.children
    const arr = Array.isArray(k) ? k : (k && typeof k === 'object' ? [k] : [])
    arr.forEach(c => findAll(c, acc))
    return acc
  }
  const rowChecks = findAll(vnode)
  assert.ok(rowChecks.length >= 1, '单行 checkbox 存在')
  assert.equal(rowChecks[0].props.checked, true, '第 1 行（key 0）预选中')
  // 取消选中
  rowChecks[0].props.onChange()
  assert.equal(sel.length, 0, '取消后 0 选中')
})
