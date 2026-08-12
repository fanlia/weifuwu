import { test, describe, it, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { TreeSelect } from './TreeSelect.ts'
import { Tree } from '../Tree/Tree.ts'
import { renderVNode } from '../../ui-dom/testing.ts'
import { createTestCtx, createPopupMock } from '../../ui-dom/testing.ts'
import { setupJsdom } from '../../test/client/setup.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { h } from '../../ui-dom/vnode.ts'
import { mountRoot } from '../../ui-dom/vdom/mount.ts'

before(setupJsdom)
afterEach(() => { createClientBrowser().clearBody() })


const makeCtx = () => createTestCtx({ ui: {
    $: () => ({}),
    render: () => {},
    dirty: () => {},
    usePopup: (opts: any) => createPopupMock(() => opts.isOpen(), opts.setOpen),
    useGlobalKey: () => () => {},
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
async function mount(Comp: any, props: any, ctx: any) {
  const factory = await Comp({}, ctx)
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
  test('渲染触发框 + placeholder', async () => {
    const vnode = await renderVNode(TreeSelect, { options, placeholder: '选择服务' }, makeCtx())
    assert.equal(vnode.props.class, 'wf-treeselect')
    assert.match(JSON.stringify(vnode), /选择服务/)
  })

  test('打开下拉 → 渲染 Tree 子组件', async () => {
    const ctx = makeCtx()
    const { render } = await mount(TreeSelect, { options }, ctx)
    let vnode = await render()
    const trigger = triggerOf(vnode)
    assert.ok(trigger, '有触发框')
    trigger.props.onClick()
    vnode = await render()
    const tree = findVNode(vnode, (v: any) => v.type === Tree)
    assert.ok(tree, '下拉内有 Tree')
  })

  test('单选：选中 key → onChange', async () => {
    let value: any = null
    const ctx = makeCtx()
    const { render } = await mount(TreeSelect, { options, onChange: (v: any) => { value = v } }, ctx)
    let vnode = await render()
    triggerOf(vnode).props.onClick()
    vnode = await render()
    const tree = findVNode(vnode, (v: any) => v.type === Tree)
    tree.props.onSelect(['http'])
    assert.equal(value, 'http')
  })

  test('多选：checkable 模式 → onChange(keys[])', async () => {
    let value: any = null
    const ctx = makeCtx()
    const { render } = await mount(TreeSelect, { options, multiple: true, onChange: (v: any) => { value = v } }, ctx)
    let vnode = await render()
    triggerOf(vnode).props.onClick()
    vnode = await render()
    const tree = findVNode(vnode, (v: any) => v.type === Tree)
    assert.equal(tree.props.checkable, true, '多选用 checkable')
    tree.props.onCheck(['http', 'pg'])
    assert.deepEqual(value, ['http', 'pg'])
  })

  test('受控 value 显示选中 label', async () => {
    const vnode = await renderVNode(TreeSelect, { options, value: 'http' }, makeCtx())
    assert.match(JSON.stringify(vnode), /HTTP 服务/, '触发框显示选中 label')
  })

  test('受控纪律：value 受控无 onChange → console.warn', async () => {
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (...a: any[]) => { warns.push(a.join(' ')) }
    try {
      await renderVNode(TreeSelect, { options, value: 'http' }, makeCtx())
    } finally {
      console.warn = origWarn
    }
    assert.ok(warns.some(w => w.includes('onChange')), '应警告缺 onChange')
  })

  test('关闭下拉：再次点击触发框 → 不渲染 Tree', async () => {
    const ctx = makeCtx()
    const { render } = await mount(TreeSelect, { options }, ctx)
    let vnode = await render()
    triggerOf(vnode).props.onClick()
    vnode = await render()
    assert.ok(findVNode(vnode, (v: any) => v.type === Tree), '打开有 Tree')
    triggerOf(vnode).props.onClick()
    vnode = await render()
    assert.equal(findVNode(vnode, (v: any) => v.type === Tree), null, '关闭无 Tree')
  })
})

test('trigger role=combobox 可聚焦（P1 键盘可达）', async () => {
  const data = [{ key: 'a', label: 'A' }]
  const vnode = await renderVNode(TreeSelect, { data }, makeCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('combobox'), 'trigger combobox 角色')
  assert.ok(/tabindex|tabIndex/.test(s), 'trigger 可聚焦')
})

// 回归：外部点击关闭（用户报告——此前只有 Escape 关闭，缺外部点击）
// DOM 级：usePopup 的 onDocMouseDown 依赖真实 document 监听，须 mountRoot 实测
test('外部点击关闭下拉（usePopup 统一组合器回归）', async () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const handle = mountRoot({ root, browser: createClientBrowser() })
  const Demo = async (_init: any, ctx: any) => () =>
    h('div', { class: 'wrapper' }, [
      h('div', { class: 'outside' }, '外部区域'),
      h(TreeSelect, { options: [{ key: 'a', label: 'A' }] }),
    ])
  await handle.mount(h('div', {}, h(Demo, {})))
  const flush = () => new Promise((r) => setTimeout(r, 30))
  await flush()

  // 打开下拉
  const trigger = root.querySelector('.wf-treeselect-trigger') as HTMLElement
  trigger.click()
  await flush()
  assert.ok(root.querySelector('.wf-treeselect-dropdown') || document.querySelector('.wf-treeselect-dropdown'), '下拉已打开')

  // 点击外部区域 → 下拉关闭
  const outside = root.querySelector('.outside') as HTMLElement
  outside.dispatchEvent(new (window as any).MouseEvent('mousedown', { bubbles: true }))
  await flush()
  assert.ok(!document.querySelector('.wf-treeselect-dropdown'), '外部点击后下拉关闭（此前 bug：不关闭）')
  handle.unmount()
})

describe('TreeSelect disabled/error（F2 状态矩阵）', () => {
  async function triggerOf(props: any) {
    const render = await TreeSelect(props, makeCtx() as any)
    return await render(props)
  }
  const treeData = [{ key: 'a', label: 'A 部门', children: [{ key: 'a1', label: 'A1 组' }] }]

  it('disabled：触发框禁用样式 + 点击不打开 + aria-disabled', async () => {
    const v = await triggerOf({ options: treeData, disabled: true })
    const trigger = v.props.children.find((c: any) => String(c.props?.class).includes('wf-treeselect-trigger'))
    assert.match(String(trigger.props.class), /--dis/, '禁用样式类')
    assert.equal(trigger.props['aria-disabled'], 'true', 'aria-disabled')
    // 点击不打开：disabled 时无 onClick 处理（禁用语义）
    assert.equal(trigger.props.onClick, undefined, 'disabled 无点击处理（不打开）')
  })

  it('error：触发框错误样式', async () => {
    const v = await triggerOf({ options: treeData, error: '必选' })
    const trigger = v.props.children.find((c: any) => String(c.props?.class).includes('wf-treeselect-trigger'))
    assert.match(String(trigger.props.class), /--err/, '错误样式类')
  })

  it('非 disabled/error 无状态类', async () => {
    const v = await triggerOf({ options: treeData })
    const trigger = v.props.children.find((c: any) => String(c.props?.class).includes('wf-treeselect-trigger'))
    assert.ok(!String(trigger.props.class).includes('--dis') && !String(trigger.props.class).includes('--err'), '无状态类')
  })
})
