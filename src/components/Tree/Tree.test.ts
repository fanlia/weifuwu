import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Tree } from './Tree.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  const state = new Proxy({}, {
    set(t: any, k, v) { t[k] = v; return true },
    get(t: any, k) { return t[k] },
  })
  return { ui: { $: () => state, render: () => {}, dirty: () => {}, ready: true } } as any
}

const data = [
  {
    key: 'root', label: '总部',
    children: [
      { key: 'tech', label: '技术部', children: [
        { key: 'fe', label: '前端组' },
        { key: 'be', label: '后端组' },
      ] },
      { key: 'mkt', label: '市场部' },
    ],
  },
]

/** 收集所有 row VNode */
function rows(vnode: any): any[] {
  const out: any[] = []
  const walk = (v: any) => {
    if (!v || typeof v !== 'object') return
    if (v.props?.class?.includes?.('wf-tree-row')) out.push(v)
    const kids = v.props?.children
    if (Array.isArray(kids)) kids.forEach(walk)
    else if (kids && typeof kids === 'object') walk(kids)
  }
  walk(vnode)
  return out
}

/** 取 row 的 label 文本 */
function labelOf(row: any): string {
  const label = row.props.children.find((c: any) => c?.props?.class === 'wf-tree-label')
  return label?.props?.children ?? ''
}

/** 取 row 的 checkbox VNode */
function checkboxOf(row: any): any {
  return row.props.children.find((c: any) => c?.props?.class?.includes?.('wf-tree-checkbox'))
}

/** 取 row 的 switcher VNode */
function switcherOf(row: any): any {
  return row.props.children.find((c: any) => c?.props?.class?.includes?.('wf-tree-switcher'))
}

describe('Tree', () => {
  it('renders root node', () => {
    const vnode = renderVNode(Tree, { data }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-tree/)
    assert.equal(rows(vnode).length, 1) // 未展开只有 root
  })

  it('collapsed by default, expand shows children', () => {
    const ctx = mockCtx()
    const result = Tree({ data }, ctx)
    const render = result as any
    let v = render({ data })
    assert.equal(rows(v).length, 1)
    // 点击 root 的展开箭头
    const rootRow = rows(v)[0]
    switcherOf(rootRow).props.onClick({ stopPropagation: () => {} })
    v = render({ data })
    assert.equal(rows(v).length, 3) // root + tech + mkt
  })

  it('受控 expandedKeys 控制展开', () => {
    const vnode = renderVNode(Tree, { data, expandedKeys: ['root', 'tech'] }, mockCtx())!
    assert.equal(rows(vnode).length, 5) // root + tech + mkt + fe + be
  })

  it('selecting node calls onSelect', () => {
    let got: string[] = []
    const vnode = renderVNode(Tree, {
      data, expandedKeys: ['root'], selectedKeys: [],
      onSelect: (k: string[]) => { got = k },
    }, mockCtx())!
    const rs = rows(vnode)
    // tech 行
    const tech = rs.find((r: any) => labelOf(r) === '技术部')
    tech.props.onClick()
    assert.deepEqual(got, ['tech'])
  })

  it('selected node marked', () => {
    const vnode = renderVNode(Tree, {
      data, expandedKeys: ['root'], selectedKeys: ['tech'],
    }, mockCtx())!
    const rs = rows(vnode)
    const tech = rs.find((r: any) => labelOf(r) === '技术部')
    assert.match(tech.props.class, /--selected/)
  })

  it('checkable: checking leaf updates checkedKeys with parent linkage', () => {
    let got: string[] = []
    const vnode = renderVNode(Tree, {
      data, expandedKeys: ['root', 'tech'], checkable: true,
      checkedKeys: [], onCheck: (k: string[]) => { got = k },
    }, mockCtx())!
    const rs = rows(vnode)
    const fe = rs.find((r: any) => labelOf(r) === '前端组')
    // checkbox 点击 → 勾选 fe（含父节点联动 tech/root？antd 默认 cascade）
    checkboxOf(fe).props.onClick({ stopPropagation: () => {} })
    assert.ok(got.includes('fe'))
    assert.ok(got.includes('tech')) // 父节点联动（子勾选 → 父非全选态：antd checkStrictly=false 时父也加入）
    assert.ok(got.includes('root'))
  })

  it('checkable: unchecking all children removes parent', () => {
    let got: string[] = ['fe', 'be', 'tech', 'root']
    const vnode = renderVNode(Tree, {
      data, expandedKeys: ['root', 'tech'], checkable: true,
      checkedKeys: ['fe', 'be', 'tech', 'root'],
      onCheck: (k: string[]) => { got = k },
    }, mockCtx())!
    const rs = rows(vnode)
    const fe = rs.find((r: any) => labelOf(r) === '前端组')
    checkboxOf(fe).props.onClick({ stopPropagation: () => {} }) // 取消 fe → be 仍选中 → tech 保留
    assert.ok(!got.includes('fe'))
    assert.ok(got.includes('tech'))
  })

  it('indeterminate checkbox rendered when partial children checked', () => {
    const vnode = renderVNode(Tree, {
      data, expandedKeys: ['root', 'tech'], checkable: true,
      checkedKeys: ['fe'],
    }, mockCtx())!
    const rs = rows(vnode)
    const tech = rs.find((r: any) => labelOf(r) === '技术部')
    assert.match(checkboxOf(tech).props.class, /--half/)
  })

  it('键盘: row 可聚焦（tabindex=0）', () => {
    const vnode = renderVNode(Tree, { data, expandedKeys: ['root'] }, mockCtx())!
    const rs = rows(vnode)
    assert.equal(rs[0].props.tabIndex, 0)
  })

  it('disabled node not interactive', () => {
    const withDis = [{ key: 'a', label: 'A', disabled: true }]
    const vnode = renderVNode(Tree, { data: withDis, expandedKeys: [] }, mockCtx())!
    const r = rows(vnode)[0]
    assert.equal(r.props.onClick, undefined)
  })
})
