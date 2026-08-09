import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { TreeSelect } from './TreeSelect.ts'
import { Tree } from '../Tree/Tree.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const mockCtx = () => ({
  ui: {
    $: () => ({}),
    render: () => {},
    dirty: () => {},
    usePopupPosition: () => ({ top: 100, left: 200, width: 220, refresh: () => {} }),
  },
}) as any

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) {
    for (const k of kids) {
      const found = findVNode(k, pred)
      if (found) return found
    }
  } else if (kids && typeof kids === 'object') {
    return findVNode(kids, pred)
  }
  return null
}

// 先 mount 拿 factory，再渲染——状态（open）保持
function mount(Comp: any, props: any, ctx: any) {
  const factory = Comp({}, ctx)
  return { render: () => factory(props) }
}

function triggerOf(vnode: any) {
  return findVNode(vnode, (v: any) => v.props?.class?.includes('wf-treeselect-trigger'))
}

const options = [
  { key: 'svc', label: '服务', children: [
    { key: 'http', label: 'HTTP 服务' },
    { key: 'rpc', label: 'RPC 服务' },
  ]},
  { key: 'db', label: '数据库', children: [
    { key: 'pg', label: 'PostgreSQL' },
    { key: 'redis', label: 'Redis' },
  ]},
]

describe('TreeSelect 组件', () => {
  test('渲染触发框 + placeholder', () => {
    const vnode = renderVNode(TreeSelect, { options, placeholder: '选择服务' }, mockCtx())
    assert.equal(vnode.props.class, 'wf-treeselect')
    assert.match(JSON.stringify(vnode), /选择服务/)
  })

  test('打开下拉 → 渲染 Tree 子组件', () => {
    const ctx = mockCtx()
    const { render } = mount(TreeSelect, { options }, ctx)
    let vnode = render()
    const trigger = triggerOf(vnode)
    assert.ok(trigger, '有触发框')
    trigger.props.onClick()
    vnode = render()
    const tree = findVNode(vnode, (v: any) => v.type === Tree)
    assert.ok(tree, '下拉内有 Tree')
  })

  test('单选：选中 key → onChange', () => {
    let value: any = null
    const ctx = mockCtx()
    const { render } = mount(TreeSelect, { options, onChange: (v: any) => { value = v } }, ctx)
    let vnode = render()
    triggerOf(vnode).props.onClick()
    vnode = render()
    const tree = findVNode(vnode, (v: any) => v.type === Tree)
    tree.props.onSelect(['http'])
    assert.equal(value, 'http')
  })

  test('多选：checkable 模式 → onChange(keys[])', () => {
    let value: any = null
    const ctx = mockCtx()
    const { render } = mount(TreeSelect, { options, multiple: true, onChange: (v: any) => { value = v } }, ctx)
    let vnode = render()
    triggerOf(vnode).props.onClick()
    vnode = render()
    const tree = findVNode(vnode, (v: any) => v.type === Tree)
    assert.equal(tree.props.checkable, true, '多选用 checkable')
    tree.props.onCheck(['http', 'pg'])
    assert.deepEqual(value, ['http', 'pg'])
  })

  test('受控 value 显示选中 label', () => {
    const vnode = renderVNode(TreeSelect, { options, value: 'http' }, mockCtx())
    assert.match(JSON.stringify(vnode), /HTTP 服务/, '触发框显示选中 label')
  })

  test('受控纪律：value 受控无 onChange → console.warn', () => {
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (...a: any[]) => { warns.push(a.join(' ')) }
    try {
      renderVNode(TreeSelect, { options, value: 'http' }, mockCtx())
    } finally {
      console.warn = origWarn
    }
    assert.ok(warns.some(w => w.includes('onChange')), '应警告缺 onChange')
  })

  test('关闭下拉：再次点击触发框 → 不渲染 Tree', () => {
    const ctx = mockCtx()
    const { render } = mount(TreeSelect, { options }, ctx)
    let vnode = render()
    triggerOf(vnode).props.onClick()
    vnode = render()
    assert.ok(findVNode(vnode, (v: any) => v.type === Tree), '打开有 Tree')
    triggerOf(vnode).props.onClick()
    vnode = render()
    assert.equal(findVNode(vnode, (v: any) => v.type === Tree), null, '关闭无 Tree')
  })
})

test('trigger role=combobox 可聚焦（P1 键盘可达）', () => {
  const data = [{ key: 'a', label: 'A' }]
  const vnode = renderVNode(TreeSelect, { data }, mockCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('combobox'), 'trigger combobox 角色')
  assert.ok(/tabindex|tabIndex/.test(s), 'trigger 可聚焦')
})
