import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Kanban } from './Kanban.ts'
import { renderVNode } from '../../ui-dom/testing.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'


const makeCtx = () => createTestCtx({ ui: {
    $: () => ({}),
    render: () => {},
    dirty: () => {},
    // 模拟内置 useDragDrop（drag 侧 + drop 侧）
    useDragDrop: (opts: any) => ({
      dropProps: {
        onDrop: opts.onDrop ? (e: any) => { e.preventDefault(); opts.onDrop(e) } : undefined,
        onDragOver: opts.onDragOver ? (e: any) => { e.preventDefault(); opts.onDragOver(e) } : undefined,
      },
      dragProps: { draggable: true, onDragStart: opts.onDragStart, onDragEnd: opts.onDragEnd },
    }),
  },
}) as any

const columns = [
  { key: 'todo', title: '待办', items: [{ id: 'a1', title: '任务A' }, { id: 'a2', title: '任务B' }] },
  { key: 'done', title: '已完成', items: [{ id: 'b1', title: '任务C' }] },
]

// 辅助：找卡片/列 vnode
function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) {
    for (const k of kids) {
      const found = findVNode(k, pred)
      if (found) return found
    }
  }
  return null
}

function makeDragEvent(over: 'none' | 'copy' | 'move' = 'none') {
  return {
    dataTransfer: { getData: () => '', setData: () => {}, dropEffect: 'move' },
    preventDefault: () => {},
    stopPropagation: () => {},
  }
}

describe('Kanban 组件', () => {
  test('渲染列 + 卡片', async () => {
    const vnode = await renderVNode(Kanban, { columns }, makeCtx())
    assert.equal(vnode.props.class, 'wf-kanban')
    const str = JSON.stringify(vnode)
    assert.match(str, /待办/)
    assert.match(str, /任务A/)
    assert.match(str, /已完成/)
  })

  test('卡片 draggable + dragstart 记录源', async () => {
    let moved = false
    const vnode = await renderVNode(Kanban, { columns, onMove: () => { moved = true } }, makeCtx())
    const card = findVNode(vnode, (v: any) => v.props?.['data-item'] === 'a1')
    assert.ok(card, '卡片存在')
    assert.equal(card.props.draggable, true, '卡片可拖拽')
    // dragstart 应设置数据
    assert.ok(card.props.onDragStart, '有 dragstart 处理')
  })

  test('跨列拖放 → onMove 回调（源列 + 目标列）', async () => {
    let from: any = null
    let to: any = null
    const vnode = await renderVNode(
      Kanban,
      {
        columns,
        onMove: (f: any, t: any) => { from = f; to = t },
      },
      makeCtx(),
    )
    // 找到"任务A"卡片（todo 列）和 done 列
    const cardA = findVNode(vnode, (v: any) => v.props?.['data-item'] === 'a1')
    const doneCol = findVNode(vnode, (v: any) => v.props?.class?.includes?.('wf-kanban-col') && v.props['data-col'] === 'done')
    assert.ok(cardA && doneCol, '卡片与目标列存在')
    // 模拟 dragstart → drop
    cardA.props.onDragStart(makeDragEvent())
    doneCol.props.onDrop?.(makeDragEvent())
    assert.ok(from, 'onMove 收到源')
    assert.equal(from.columnKey, 'todo')
    assert.equal(to.columnKey, 'done')
  })

  test('同列内重排 → onMove（卡片间 drop 带 index）', async () => {
    let from: any = null
    let to: any = null
    const vnode = await renderVNode(
      Kanban,
      {
        columns,
        onMove: (f: any, t: any) => { from = f; to = t },
      },
      makeCtx(),
    )
    const cardA = findVNode(vnode, (v: any) => v.props?.['data-item'] === 'a1')
    const cardB = findVNode(vnode, (v: any) => v.props?.['data-item'] === 'a2')
    assert.ok(cardA && cardB)
    cardA.props.onDragStart(makeDragEvent())
    // 拖到 任务B 上 → 插到 index 1
    cardB.props.onDrop?.(makeDragEvent())
    assert.equal(from.index, 0)
    assert.equal(to.columnKey, 'todo')
    assert.equal(to.index, 1)
  })

  test('空列渲染（无卡片）', async () => {
    const cols = [{ key: 'empty', title: '空列', items: [] }]
    const vnode = await renderVNode(Kanban, { columns: cols }, makeCtx())
    assert.ok(JSON.stringify(vnode).includes('空列'))
  })

  test('受控纪律：传 columns 无 onMove → console.warn', async () => {
    const warns: string[] = []
    const origWarn = console.warn
    console.warn = (...a: any[]) => { warns.push(a.join(' ')) }
    try {
      await renderVNode(Kanban, { columns }, makeCtx())
    } finally {
      console.warn = origWarn
    }
    assert.ok(warns.some(w => w.includes('onMove')), '应警告缺 onMove: ' + warns.join('|'))
  })
})
