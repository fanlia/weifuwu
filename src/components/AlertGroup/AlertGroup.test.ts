import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AlertGroup } from './AlertGroup.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const r = Comp(props, ctx)
  return typeof r === 'function' ? r(props) : r
}
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
const mockCtx = () => ({ ui: { $: () => ({}), render: () => {}, dirty: () => {} } }) as any

const items = [
  { id: '1', message: '服务 A 重启', time: '10:01' },
  { id: '2', message: '服务 B 重启', time: '10:02' },
  { id: '3', message: '服务 C 重启', time: '10:03' },
]

describe('AlertGroup', () => {
  test('合并阈值：≥3 条折叠为 +N', () => {
    const v = renderVNode(AlertGroup, { items }, mockCtx())
    const summary = findVNode(v, (x: any) => x.props?.class?.includes('wf-alertgroup-summary'))
    assert.ok(summary, '折叠摘要存在')
    assert.match(JSON.stringify(summary.props.children), /3/, '显示 +3')
  })
  test('少于 3 条 → 平铺', () => {
    const v = renderVNode(AlertGroup, { items: items.slice(0, 2) }, mockCtx())
    const summary = findVNode(v, (x: any) => x.props?.class?.includes('wf-alertgroup-summary'))
    assert.equal(summary, null, '2 条不折叠')
  })
  test('展开折叠查看全部', () => {
    const ctx = mockCtx()
    const r0 = renderVNode(AlertGroup, { items }, ctx)
    const r1 = typeof r0 === 'function' ? r0 : r0
    void r1
    // mount 保持状态
    const factory = AlertGroup({}, ctx)
    let v = factory({ items })
    const summary = findVNode(v, (x: any) => x.props?.class?.includes('wf-alertgroup-summary'))
    summary.props.onClick()
    v = factory({ items })
    const expanded = findVNode(v, (x: any) => x.props?.class?.includes('wf-alertgroup-list--open'))
    assert.ok(expanded, '展开列表')
  })
})
