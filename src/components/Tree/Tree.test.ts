import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Tree } from './Tree.ts'
import { VirtualList } from '../VirtualList/VirtualList.ts'
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

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) { for (const k of kids) { const f = findVNode(k, pred); if (f) return f } }
  else if (kids && typeof kids === 'object') return findVNode(kids, pred)
  return null
}

describe('Tree', () => {
  it('renders root node', async () => {
    const vnode = await renderVNode(Tree, { data }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-tree/)
    assert.equal(rows(vnode).length, 1) // 未展开只有 root
  })

  it('collapsed by default, expand shows children', async () => {
    const ctx = createTestCtx()
    const result = await Tree({ data }, ctx)
    const render = result as any
    let v = await render({ data })
    assert.equal(rows(v).length, 1)
    // 点击 root 的展开箭头
    const rootRow = rows(v)[0]
    switcherOf(rootRow).props.onClick({ stopPropagation: () => {} })
    v = await render({ data })
    assert.equal(rows(v).length, 3) // root + tech + mkt
  })

  it('受控 expandedKeys 控制展开', async () => {
    const vnode = await renderVNode(Tree, { data, expandedKeys: ['root', 'tech'] }, createTestCtx())!
    assert.equal(rows(vnode).length, 5) // root + tech + mkt + fe + be
  })

  it('expandOnClick：点击有子节点行 = 展开/折叠（不触发选中）', async () => {
    const ctx = createTestCtx()
    let selected: string[] = []
    const factory = await Tree({ data }, ctx)
    let v = await factory({ data, expandOnClick: true, onSelect: (k: string[]) => { selected = k } })
    assert.equal(rows(v).length, 1)
    // 点击 root 行（有子节点）→ 展开而非选中
    rows(v)[0].props.onClick()
    assert.equal(selected.length, 0, '有子节点行不触发选中')
    v = await factory({ data, expandOnClick: true, onSelect: (k: string[]) => { selected = k } })
    assert.equal(rows(v).length, 3, '点击行展开子节点')
    // 再次点击 → 折叠
    rows(v)[0].props.onClick()
    v = await factory({ data, expandOnClick: true, onSelect: (k: string[]) => { selected = k } })
    assert.equal(rows(v).length, 1, '再次点击折叠')
  })

  it('expandOnClick：叶子行仍正常选中', async () => {
    let got: string[] = []
    const ctx = createTestCtx()
    const factory = await Tree({ data }, ctx)
    let v = await factory({ data, expandOnClick: true, expandedKeys: ['root', 'tech'], onSelect: (k: string[]) => { got = k } })
    // 展开后点击叶子（技术部下 fe）
    const feRow = rows(v).find((r: any) => labelOf(r) === '前端组')
    feRow.props.onClick()
    assert.deepEqual(got, ['fe'])
  })

  it('selecting node calls onSelect', async () => {
    let got: string[] = []
    const vnode = await renderVNode(Tree, {
      data, expandedKeys: ['root'], selectedKeys: [],
      onSelect: (k: string[]) => { got = k },
    }, createTestCtx())!
    const rs = rows(vnode)
    // tech 行
    const tech = rs.find((r: any) => labelOf(r) === '技术部')
    tech.props.onClick()
    assert.deepEqual(got, ['tech'])
  })

  it('selected node marked', async () => {
    const vnode = await renderVNode(Tree, {
      data, expandedKeys: ['root'], selectedKeys: ['tech'],
    }, createTestCtx())!
    const rs = rows(vnode)
    const tech = rs.find((r: any) => labelOf(r) === '技术部')
    assert.match(tech.props.class, /--selected/)
  })

  it('checkable: checking leaf updates checkedKeys with parent linkage', async () => {
    let got: string[] = []
    const vnode = await renderVNode(Tree, {
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

  it('checkable: unchecking all children removes parent', async () => {
    let got: string[] = ['fe', 'be', 'tech', 'root']
    const vnode = await renderVNode(Tree, {
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

  it('indeterminate checkbox rendered when partial children checked', async () => {
    const vnode = await renderVNode(Tree, {
      data, expandedKeys: ['root', 'tech'], checkable: true,
      checkedKeys: ['fe'],
    }, createTestCtx())!
    const rs = rows(vnode)
    const tech = rs.find((r: any) => labelOf(r) === '技术部')
    assert.match(checkboxOf(tech).props.class, /--half/)
  })

  it('半选向上传播：子级部分选中时所有祖先都 indeterminate（前端✓→技术部◐→总部◐）', async () => {
    const vnode = await renderVNode(Tree, {
      data, expandedKeys: ['root', 'tech'], checkable: true,
      checkedKeys: ['fe'],
    }, createTestCtx())!
    const rs = rows(vnode)
    const root = rs.find((r: any) => labelOf(r) === '总部')
    assert.match(checkboxOf(root).props.class, /--half/, '总部应半选（孙代 fe 选中）')
    // 全选子树时祖先应变为 checked（非 half）
    const vnode2 = await renderVNode(Tree, {
      data, expandedKeys: ['root', 'tech'], checkable: true,
      checkedKeys: ['fe', 'be', 'mkt'],
    }, createTestCtx())!
    const rs2 = rows(vnode2)
    const root2 = rs2.find((r: any) => labelOf(r) === '总部')
    assert.doesNotMatch(checkboxOf(root2).props.class, /--half/, '子树全选时总部不应半选')
    assert.match(checkboxOf(root2).props.class, /--checked/, '子树全选时总部应 checked')
  })

  it('键盘: row 可聚焦（tabindex=0）', async () => {
    const vnode = await renderVNode(Tree, { data, expandedKeys: ['root'] }, createTestCtx())!
    const rs = rows(vnode)
    assert.equal(rs[0].props.tabIndex, 0)
  })

  it('disabled node not interactive', async () => {
    const withDis = [{ key: 'a', label: 'A', disabled: true }]
    const vnode = await renderVNode(Tree, { data: withDis, expandedKeys: [] }, createTestCtx())!
    const r = rows(vnode)[0]
    assert.equal(r.props.onClick, undefined)
  })
})

it('searchValue：过滤匹配节点 + 自动展开祖先路径', async () => {
  const ctx = createTestCtx()
  const factory = await Tree({}, ctx)
  // 搜「前端」——应只显示 root > tech > fe（祖先自动展开）
  const vnode = await factory({ data, searchValue: '前端' })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('前端'), '匹配节点渲染（label 被 highlight 拆分，查匹配片段）')
  assert.ok(!s.includes('市场部'), '不匹配的兄弟节点过滤')
  assert.ok(!s.includes('后端组'), '不匹配的同级叶子过滤')
  // 祖先保留（总部/技术部）
  assert.ok(s.includes('总部'), '祖先保留')
  assert.ok(s.includes('技术部'), '祖先保留')
})

it('searchValue：高亮 mark + 无匹配空提示', async () => {
  const ctx = createTestCtx()
  const factory = await Tree({}, ctx)
  const vnode = await factory({ data, searchValue: '前端' })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-tree-match'), '高亮 mark 渲染')
  // 无匹配
  const empty = await factory({ data, searchValue: '不存在' })
  assert.ok(JSON.stringify(empty).includes('无匹配节点'), '无匹配空提示')
})

describe('Tree 空态（F2 状态矩阵）', () => {
  it('空 data 显示"暂无数据"', async () => {
    const vnode = await renderVNode(Tree, { data: [] }, createTestCtx())
    const empty = findVNode(vnode, (v: any) => String(v.props?.class).includes('wf-tree-empty'))
    assert.ok(empty, '空态节点存在')
    assert.equal(empty.props.children, '暂无数据')
  })
})

describe('Tree 虚拟滚动（virtual）', () => {
  const bigTree = Array.from({ length: 500 }, (_, i) => ({
    key: `n${i}`, label: `节点 ${i}`,
    children: Array.from({ length: 5 }, (_, j) => ({ key: `n${i}-${j}`, label: `子节点 ${i}-${j}` })),
  }))

  // renderVNode 只渲染一层——VirtualList 是子组件（type 函数引用），断言其 props
  it('virtual 渲染 VirtualList（items=可见扁平行 + 固定行高 28）', async () => {
    const vnode = await renderVNode(Tree, { data: bigTree, virtual: true, height: 300 }, createTestCtx())!
    const vl = vnode.props.children[0]
    assert.equal(vl.type, VirtualList, '虚拟模式渲染 VirtualList 组件')
    assert.equal(vl.props.items.length, 500, '未展开：500 可见行')
    assert.equal(vl.props.itemHeight, 28)
    assert.equal(vl.props.height, 300)
    assert.equal(typeof vl.props.renderItem, 'function')
  })

  it('virtual 展开后可见行数变化（子节点进扁平集）', async () => {
    const vnode = await renderVNode(Tree, { data: bigTree, virtual: true, height: 300, expandedKeys: ['n0'] }, createTestCtx())!
    // 501 行（500 + n0 的 5 个子节点）
    const vl = vnode.props.children[0]
    assert.equal(vl.props.items.length, 505, '展开 n0 后可见行 = 500 + 5')
    assert.equal(vl.props.items[1].node.label, '子节点 0-0', 'DFS：n0 的子节点紧跟其后')
    assert.equal(vl.props.items[6].node.label, '节点 1', 'n0 子树结束后回到下一个根')
  })

  it('virtual 行 key = 节点 key（展开/折叠后身份稳定）', async () => {
    const vnode = await renderVNode(Tree, { data: bigTree, virtual: true, height: 300 }, createTestCtx())!
    const vl = vnode.props.children[0]
    assert.equal(vl.props.keyBy(vl.props.items[10], 10), 'n10')
  })

  it('非 virtual 保持递归渲染（无 VirtualList）', async () => {
    const vnode = await renderVNode(Tree, { data: bigTree }, createTestCtx())!
    assert.ok(!JSON.stringify(vnode).includes('wf-virtual-list'), '非虚拟模式不走 VirtualList')
  })
})
