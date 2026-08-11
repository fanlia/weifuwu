import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AlertGroup } from './AlertGroup.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) {
    for (const k of kids) {
      const f = findVNode(k, pred)
      if (f) return f
    }
  } else if (kids && typeof kids === 'object') return findVNode(kids, pred)
  return null
}

const items = [
  { id: '1', message: '服务 A 重启', time: '10:01' },
  { id: '2', message: '服务 B 重启', time: '10:02' },
  { id: '3', message: '服务 C 重启', time: '10:03' },
]

describe('AlertGroup', () => {
  test('合并阈值：≥3 条折叠为 +N', async () => {
    const v = await renderVNode(AlertGroup, { items }, createTestCtx())
    const summary = findVNode(v, (x: any) => x.props?.class?.includes('wf-alertgroup-summary'))
    assert.ok(summary, '折叠摘要存在')
    assert.match(JSON.stringify(summary.props.children), /3/, '显示 +3')
  })
  test('少于 3 条 → 平铺', async () => {
    const v = await renderVNode(AlertGroup, { items: items.slice(0, 2) }, createTestCtx())
    const summary = findVNode(v, (x: any) => x.props?.class?.includes('wf-alertgroup-summary'))
    assert.equal(summary, null, '2 条不折叠')
  })
  test('展开折叠查看全部', async () => {
    const ctx = createTestCtx()
    const r0 = await renderVNode(AlertGroup, { items }, ctx)
    const r1 = typeof r0 === 'function' ? r0 : r0
    void r1
    // mount 保持状态
    const factory = await AlertGroup({}, ctx)
    let v = factory({ items })
    const summary = findVNode(v, (x: any) => x.props?.class?.includes('wf-alertgroup-summary'))
    summary.props.onClick()
    v = factory({ items })
    const expanded = findVNode(v, (x: any) => x.props?.class?.includes('wf-alertgroup-list--open'))
    assert.ok(expanded, '展开列表')
  })
})

test('onClose 回调带 id（关闭按钮）', async () => {
  let closed: string | undefined
  const items = [
    { id: 'a', message: 'm1', variant: 'info' as const },
    { id: 'b', message: 'm2', variant: 'success' as const },
  ]
  const vnode = await renderVNode(AlertGroup, { items, onClose: (id: string) => { closed = id } }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-alertgroup-close'), '有 onClose 时渲染关闭按钮')
  const closeBtn = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-alertgroup-close'))
  closeBtn.props.onClick()
  assert.equal(closed, 'a', '回调携带 item.id')
})

test('无 onClose 不渲染关闭按钮', async () => {
  const items = [{ id: 'a', message: 'm1' }]
  const vnode = await renderVNode(AlertGroup, { items }, createTestCtx())!
  assert.ok(!JSON.stringify(vnode).includes('wf-alertgroup-close'))
})

test('variant 着色类（success/warning/error/info）', async () => {
  const items = [
    { id: 'a', message: '1', variant: 'success' as const },
    { id: 'b', message: '2', variant: 'warning' as const },
  ]
  const vnode = await renderVNode(AlertGroup, { items }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-alertgroup-item--success') && s.includes('wf-alertgroup-item--warning'))
})

test('time 字段渲染', async () => {
  const items = [{ id: 'a', message: 'm', time: '10:24' }]
  const vnode = await renderVNode(AlertGroup, { items }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('10:24'))
})

test('空 items 渲染空容器不抛错（边界）', async () => {
  const vnode = await renderVNode(AlertGroup, { items: [] }, createTestCtx())!
  assert.ok(vnode.props.class.includes('wf-alertgroup'))
})
