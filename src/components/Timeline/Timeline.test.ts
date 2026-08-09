import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Timeline } from './Timeline.ts'
import type { WfuiContext } from '../../client/types.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

const items = [
  { key: 'a', title: '创建', time: '10:00', content: '创建了 Agent' },
  { key: 'b', title: '执行', status: 'success' as const, content: '工具调用完成' },
  { key: 'c', title: '失败', status: 'error' as const },
]

describe('Timeline', () => {
  it('渲染容器 ul.wf-timeline', () => {
    const vnode = renderVNode(Timeline, { items }, mockCtx())!
    assert.equal(vnode.type, 'ul')
    assert.match(vnode.props.class, /wf-timeline/)
    assert.equal(vnode.props.children.length, 3)
  })

  it('每项渲染 li + 节点 + 内容（title/time/content）', () => {
    const vnode = renderVNode(Timeline, { items }, mockCtx())!
    const li = vnode.props.children[0]
    assert.equal(li.type, 'li')
    // 结构: [节点列, 内容列]
    const contentCol = li.props.children[1]
    const texts = collectText(contentCol)
    assert.ok(texts.includes('创建'))
    assert.ok(texts.includes('10:00'))
    assert.ok(texts.includes('创建了 Agent'))
  })

  it('状态类映射（success/error）', () => {
    const vnode = renderVNode(Timeline, { items }, mockCtx())!
    const li1 = vnode.props.children[1]
    const node = li1.props.children[0]
    assert.match(node.props.class, /wf-timeline-node--success/)
    const li2 = vnode.props.children[2]
    assert.match(li2.props.children[0].props.class, /wf-timeline-node--error/)
  })

  it('reverse 反转顺序', () => {
    const vnode = renderVNode(Timeline, { items, reverse: true }, mockCtx())!
    const first = collectText(vnode.props.children[0])
    assert.ok(first.includes('失败'))
  })

  it('可点击项：role=button + onClick', () => {
    let clicked = false
    const vnode = renderVNode(Timeline, {
      items: [{ key: 'x', title: '日志', onClick: () => { clicked = true } }],
    }, mockCtx())!
    const li = vnode.props.children[0]
    assert.equal(li.props.role, 'button')
    assert.match(li.props.class, /wf-timeline-item--clickable/)
    li.props.onClick()
    assert.equal(clicked, true)
  })

  it('不可点击项无 role=button（纯展示非 focusable）', () => {
    const vnode = renderVNode(Timeline, { items: [{ key: 'x', title: '只读' }] }, mockCtx())!
    assert.equal(vnode.props.children[0].props.role, undefined)
  })

  it('alternate 模式：奇偶项左右交替', () => {
    const vnode = renderVNode(Timeline, { items, mode: 'alternate' }, mockCtx())!
    const classes = vnode.props.children.map((li: any) => li.props.class)
    assert.match(classes[0], /wf-timeline-item--alt-left/)
    assert.match(classes[1], /wf-timeline-item--alt-right/)
  })
})

function collectText(node: any): string[] {
  const out: string[] = []
  const walk = (n: any) => {
    if (n == null || typeof n === 'boolean') return
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return }
    if (Array.isArray(n)) { n.forEach(walk); return }
    if (n.props?.children != null) walk(n.props.children)
  }
  walk(node)
  return out
}

it('reverse 反转顺序 + mode=alternate 类（边界/变体）', () => {
  const items = [
    { key: '1', title: '先', time: '10:00' },
    { key: '2', title: '后', time: '11:00' },
  ]
  const vnode = renderVNode(Timeline, { items, reverse: true, mode: 'alternate' }, mockCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('alt-left') || s.includes('alt-right'), 'alternate 模式类')
  assert.ok(s.indexOf('后') < s.indexOf('先'), 'reverse 后"后"在前')
})

it('horizontal 模式：横向类 + 水平连接线', () => {
  const items = [
    { key: '1', title: '提交', time: '10:00' },
    { key: '2', title: '审核', time: '11:00' },
    { key: '3', title: '完成', time: '12:00', status: 'success' as const },
  ]
  const vnode = renderVNode(Timeline, { items, mode: 'horizontal' }, mockCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-timeline--h'), '横向容器类')
  assert.ok(s.includes('wf-timeline-item--h'), '横向项类')
  // 节点垂直排列（node 在 col 前）
  assert.ok(s.includes('提交') && s.includes('完成'), '内容渲染')
})
