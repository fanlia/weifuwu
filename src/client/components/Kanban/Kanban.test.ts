/**
 * Kanban 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * 锁定（2026-12 key 纪律专项）：
 * - 首帧：结构（列/卡片 data 面——data-col/data-item 身份属性）
 * - key 通道（2026-12 补——列/卡片原先无 key）：列中间插入 → move 命令 +
 *   单一 create（keyed diff 身份跟随——unkeyed 位置对照会全列 setProp 抖动）
 * - 卡片中间插入：同上（拖拽重排核心——身份保持前提）
 * - 受控纪律：缺 onMove → warn（静默不可用防护——既有契约保持）
 *
 * 运行：node --env-file=.env --test src/client/components/Kanban/Kanban.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Kanban } from './Kanban.ts'
import { mount, ops, createTable } from '../../../test/contract/component-harness.ts'

const col = (key: string, itemIds: string[]) => ({
  key,
  title: `列-${key}`,
  items: itemIds.map((id) => ({ id, title: `卡-${id}` })),
})

test('首帧：结构 + data 身份面 + 受控拖拽属性', async () => {
  const h = await mount(Kanban, { columns: [col('todo', ['a', 'b']), col('done', ['c'])], onMove: () => {} })
  const ct = createTable(h.cmds)
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
  const colEls = [...ct.values()].filter((n) => String(n.attrs.class ?? '') === 'wf-kanban-col')
  assert.equal(colEls.length, 2, '2 列')
  assert.ok(colEls.every((n) => typeof n.attrs['data-col'] === 'string'), '列 data-col 身份')
  const cards = [...ct.values()].filter((n) => String(n.attrs.class ?? '') === 'wf-kanban-card')
  assert.equal(cards.length, 3, '3 卡')
  assert.ok(cards.every((n) => typeof n.attrs['data-item'] === 'string'), '卡片 data-item 身份')
  assert.ok(cards.every((n) => n.attrs.draggable !== undefined), '卡片可拖拽')
})

test('列中间插入 → move 命令 + 单一列 create（key 身份跟随——key 通道锁定）', async () => {
  const h = await mount(Kanban, { columns: [col('a', ['a1']), col('b', ['b1']), col('c', ['c1'])], onMove: () => {} })
  const cmds = await h.render({
    columns: [col('a', ['a1']), col('x', ['x1']), col('b', ['b1']), col('c', ['c1'])],
    onMove: () => {},
  })
  // keyed：现有列身份保持（move 让位）——只有 x 列 create
  assert.ok(cmds.some((c) => c.op === 'move'), `含 move（实际: ${ops(cmds).join(',')}）`)
  const colCreates = cmds.filter((c) => c.op === 'create' && (c as any).attrs?.class === 'wf-kanban-col')
  assert.equal(colCreates.length, 1, `仅 1 列 create（实际: ${colCreates.length}）`)
})

test('卡片中间插入 → move 命令 + 单一卡片 create（拖拽重排身份保持）', async () => {
  const h = await mount(Kanban, { columns: [col('a', ['a1', 'a2', 'a3'])], onMove: () => {} })
  const cmds = await h.render({ columns: [col('a', ['a1', 'a9', 'a2', 'a3'])], onMove: () => {} })
  assert.ok(cmds.some((c) => c.op === 'move'), `含 move（实际: ${ops(cmds).join(',')}）`)
  const cardCreates = cmds.filter((c) => c.op === 'create' && (c as any).attrs?.class === 'wf-kanban-card')
  assert.equal(cardCreates.length, 1, `仅 1 卡 create（实际: ${cardCreates.length}）`)
})

test('受控纪律：columns 受控缺 onMove → warn（静默不可用防护）', async () => {
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    await mount(Kanban, { columns: [col('a', ['a1'])] })
    assert.ok(warns.some((w) => w.includes('Kanban') && w.includes('onMove')), '缺 onMove warn')
  } finally {
    console.warn = origWarn
  }
})

test('卸载：零异常（DnD 状态闭包清理）', async () => {
  const h = await mount(Kanban, { columns: [col('a', ['a1'])], onMove: () => {} })
  h.unmount()
  assert.equal(h.mounts(), 0, '卸载后实例记录清空')
})
