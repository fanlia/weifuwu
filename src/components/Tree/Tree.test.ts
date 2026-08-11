import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Tree } from './Tree.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  const state = new Proxy({}, {
    set(t: any, k, v) { t[k] = v; return true },
    get(t: any, k) { return t[k] },
  })
  const uncontrolled = new Map<string, any>()
  return { ui: {
    $: () => state, render: () => {}, dirty: () => {}, ready: true,
    useControlled: (opts: any) => {
      const controlled = opts.value !== undefined
      const key = opts.name ?? 'default'
      if (!uncontrolled.has(key)) uncontrolled.set(key, opts.value)
      const setValue = (v: any) => {
        if (controlled) opts.onChange?.(v)
        else uncontrolled.set(key, v)
      }
      return { value: controlled ? opts.value : uncontrolled.get(key), setValue, controlled }
    },
  } } as any
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
    const vnode = renderVNode(Tree, { data }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-tree/)
    assert.equal(rows(vnode).length, 1) // 未展开只有 root
  })

  it('collapsed by default, expand shows children', () => {
    const ctx = createTestCtx()
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
    const vnode = renderVNode(Tree, { data, expandedKeys: ['root', 'tech'] }, createTestCtx())!
    assert.equal(rows(vnode).length, 5) // root + tech + mkt + fe + be
  })

  it('expandOnClick：点击有子节点行 = 展开/折叠（不触发选中）', () => {
    const ctx = createTestCtx()
    let selected: string[] = []
    const factory = Tree({ data }, ctx)
    let v = factory({ data, expandOnClick: true, onSelect: (k: string[]) => { selected = k } })
    assert.equal(rows(v).length, 1)
    // 点击 root 行（有子节点）→ 展开而非选中
    rows(v)[0].props.onClick()
    assert.equal(selected.length, 0, '有子节点行不触发选中')
    v = factory({ data, expandOnClick: true, onSelect: (k: string[]) => { selected = k } })
    assert.equal(rows(v).length, 3, '点击行展开子节点')
    // 再次点击 → 折叠
    rows(v)[0].props.onClick()
    v = factory({ data, expandOnClick: true, onSelect: (k: string[]) => { selected = k } })
    assert.equal(rows(v).length, 1, '再次点击折叠')
  })

  it('expandOnClick：叶子行仍正常选中', () => {
    let got: string[] = []
    const ctx = createTestCtx()
    const factory = Tree({ data }, ctx)
    let v = factory({ data, expandOnClick: true, expandedKeys: ['root', 'tech'], onSelect: (k: string[]) => { got = k } })
    // 展开后点击叶子（技术部下 fe）
    const feRow = rows(v).find((r: any) => labelOf(r) === '前端组')
    feRow.props.onClick()
    assert.deepEqual(got, ['fe'])
  })

  it('selecting node calls onSelect', () => {
    let got: string[] = []
    const vnode = renderVNode(Tree, {
      data, expandedKeys: ['root'], selectedKeys: [],
      onSelect: (k: string[]) => { got = k },
    }, createTestCtx())!
    const rs = rows(vnode)
    // tech 行
    const tech = rs.find((r: any) => labelOf(r) === '技术部')
    tech.props.onClick()
    assert.deepEqual(got, ['tech'])
  })

  it('selected node marked', () => {
    const vnode = renderVNode(Tree, {
      data, expandedKeys: ['root'], selectedKeys: ['tech'],
    }, createTestCtx())!
    const rs = rows(vnode)
    const tech = rs.find((r: any) => labelOf(r) === '技术部')
    assert.match(tech.props.class, /--selected/)
  })

  it('checkable: checking leaf updates checkedKeys with parent linkage', () => {
    let got: string[] = []
    const vnode = renderVNode(Tree, {
      data, expandedKeys: ['root', 'tech'], checkable: true,
      checkedKeys: [], onCheck: (k: string[]) => { got = k },
    }, createTestCtx())!
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
    }, createTestCtx())!
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
    }, createTestCtx())!
    const rs = rows(vnode)
    const tech = rs.find((r: any) => labelOf(r) === '技术部')
    assert.match(checkboxOf(tech).props.class, /--half/)
  })

  it('半选向上传播：子级部分选中时所有祖先都 indeterminate（前端✓→技术部◐→总部◐）', () => {
    const vnode = renderVNode(Tree, {
      data, expandedKeys: ['root', 'tech'], checkable: true,
      checkedKeys: ['fe'],
    }, createTestCtx())!
    const rs = rows(vnode)
    const root = rs.find((r: any) => labelOf(r) === '总部')
    assert.match(checkboxOf(root).props.class, /--half/, '总部应半选（孙代 fe 选中）')
    // 全选子树时祖先应变为 checked（非 half）
    const vnode2 = renderVNode(Tree, {
      data, expandedKeys: ['root', 'tech'], checkable: true,
      checkedKeys: ['fe', 'be', 'mkt'],
    }, createTestCtx())!
    const rs2 = rows(vnode2)
    const root2 = rs2.find((r: any) => labelOf(r) === '总部')
    assert.doesNotMatch(checkboxOf(root2).props.class, /--half/, '子树全选时总部不应半选')
    assert.match(checkboxOf(root2).props.class, /--checked/, '子树全选时总部应 checked')
  })

  it('键盘: row 可聚焦（tabindex=0）', () => {
    const vnode = renderVNode(Tree, { data, expandedKeys: ['root'] }, createTestCtx())!
    const rs = rows(vnode)
    assert.equal(rs[0].props.tabIndex, 0)
  })

  it('disabled node not interactive', () => {
    const withDis = [{ key: 'a', label: 'A', disabled: true }]
    const vnode = renderVNode(Tree, { data: withDis, expandedKeys: [] }, createTestCtx())!
    const r = rows(vnode)[0]
    assert.equal(r.props.onClick, undefined)
  })
})

it('searchValue：过滤匹配节点 + 自动展开祖先路径', () => {
  const ctx = createTestCtx()
  const factory = Tree({}, ctx)
  // 搜「前端」——应只显示 root > tech > fe（祖先自动展开）
  const vnode = factory({ data, searchValue: '前端' })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('前端'), '匹配节点渲染（label 被 highlight 拆分，查匹配片段）')
  assert.ok(!s.includes('市场部'), '不匹配的兄弟节点过滤')
  assert.ok(!s.includes('后端组'), '不匹配的同级叶子过滤')
  // 祖先保留（总部/技术部）
  assert.ok(s.includes('总部'), '祖先保留')
  assert.ok(s.includes('技术部'), '祖先保留')
})

it('searchValue：高亮 mark + 无匹配空提示', () => {
  const ctx = createTestCtx()
  const factory = Tree({}, ctx)
  const vnode = factory({ data, searchValue: '前端' })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-tree-match'), '高亮 mark 渲染')
  // 无匹配
  const empty = factory({ data, searchValue: '不存在' })
  assert.ok(JSON.stringify(empty).includes('无匹配节点'), '无匹配空提示')
})
