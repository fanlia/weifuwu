import { test } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../ui-dom/setup.ts'
import { renderVNode, findByClass, createTestCtx } from '../../ui-dom/testing.ts'
import { SortableList } from './SortableList.ts'

function ctxWithDragDrop() {
  const ctx = createTestCtx()
  // useDragDrop mock：dragProps 透传 options 回调（组件逻辑经 onDragEnd 触发）
  ctx.ui.useDragDrop = (options: any) => ({
    dropProps: {},
    dragProps: {
      draggable: true,
      onDragStart: (e: any) => options.onDragStart?.(e),
      onDragEnd: (e: any) => options.onDragEnd?.(e),
    },
  })
  return ctx
}

test('SortableList：渲染列表项（keyField 业务身份）', async () => {
  setupJsdom()
  const ctx = ctxWithDragDrop()
  const items = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }]
  const vnode = await renderVNode(SortableList, {
    items,
    keyField: 'id',
    renderItem: (it) => `item-${it.name}`,
    onReorder: () => {},
  }, ctx)
  const items2 = findByClass(vnode, 'wf-sortable-item')
  assert.equal(items2.length, 2, '两项渲染')
  const first = items2[0] as any
  assert.equal(first.props.key, '1', 'key = 业务 id')
  assert.equal(first.props['data-wf-key'], '1', 'data-wf-key = 业务 id')
  assert.ok(first.props.draggable, 'draggable')
  assert.ok(typeof first.props.onDragStart === 'function', 'onDragStart 存在')
})

test('SortableList：缺 onReorder 受控 warn（防静默失效）', async () => {
  setupJsdom()
  const warns: string[] = []
  const ow = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  try {
    const ctx = ctxWithDragDrop()
    await renderVNode(SortableList, {
      items: [{ id: 1, name: 'A' }],
      keyField: 'id',
      renderItem: (it) => `item-${it.name}`,
    }, ctx)
  } finally {
    console.warn = ow
  }
  assert.ok(warns.some((w) => w.includes('SortableList')), '受控 warn 触发')
})

test('SortableList：拖拽数据流（dragStart → dragOver → dragEnd 重排回调）', async () => {
  setupJsdom()
  const ctx = ctxWithDragDrop()
  let reordered: any = null
  const items = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]
  const vnode: any = await renderVNode(SortableList, {
    items, keyField: 'id',
    renderItem: (it) => `item-${it.name}`,
    onReorder: (next) => { reordered = next },
  }, ctx)
  const list = findByClass(vnode, 'wf-sortable-item')
  // 模拟拖拽：第 1 项 dragStart（记录 index 0）→ 第 3 项 dragOver（overIndex 2）→ dragEnd
  ;(list[0] as any).props.onDragStart({ dataTransfer: { setData: () => {}, effectAllowed: '' } })
  ;(list[2] as any).props.onDragOver({ preventDefault: () => {} })
  ;(list[0] as any).props.onDragEnd({})
  assert.ok(reordered, 'onReorder 触发')
  assert.equal(reordered[0].name, 'B', 'A 移到 C 之后（B,C,A）')
})
