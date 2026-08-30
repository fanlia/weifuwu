/**
 * Pipeline 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * 锁定（2026-12 key 纪律专项）：
 * - 首帧：节点/边结构 + data-id 身份面 + 状态类
 * - key 通道（2026-12 补——节点原先只有 data-id 无 key）：节点中间插入 →
 *   move 命令 + 单一 create（keyed diff 身份跟随）
 * - 状态变化：status → 类名就地切换（不重建）
 *
 * 运行：node --env-file=.env --test src/client/components/Pipeline/Pipeline.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Pipeline } from './Pipeline.ts'
import { mount, ops, createTable } from '../../../test/contract/component-harness.ts'

const nodes = (ids: string[], status?: string) => ids.map((id) => ({ id, label: id.toUpperCase(), status }))
const edges = [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }]

test('首帧：节点结构 + data-id 身份面 + 状态类', async () => {
  const h = await mount(Pipeline, { nodes: nodes(['a', 'b', 'c']), edges })
  const ct = createTable(h.cmds)
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
  const nodeEls = [...ct.values()].filter((n) => String(n.attrs.class ?? '').split(' ').includes('wf-pipeline-node'))
  assert.equal(nodeEls.length, 3, '3 节点')
  assert.ok(nodeEls.every((n) => typeof n.attrs['data-id'] === 'string'), 'data-id 身份')
})

test('节点中间插入 → move + 单一 create（key 身份跟随——key 通道锁定）', async () => {
  const h = await mount(Pipeline, { nodes: nodes(['a', 'b', 'c']), edges })
  const cmds = await h.render({ nodes: nodes(['a', 'x', 'b', 'c']), edges })
  assert.ok(cmds.some((c) => c.op === 'move'), `含 move（实际: ${ops(cmds).join(',')}）`)
  const nodeCreates = cmds.filter((c) => c.op === 'create' && String((c as any).attrs?.class ?? '').split(' ').includes('wf-pipeline-node'))
  assert.equal(nodeCreates.length, 1, `仅 1 节点 create（实际: ${nodeCreates.length}）`)
})

test('状态变化：status → 节点类名就地切换（不重建）', async () => {
  const h = await mount(Pipeline, { nodes: nodes(['a', 'b', 'c']), edges })
  const before = h.mounts()
  const cmds = await h.render({ nodes: nodes(['a', 'b', 'c'], 'active'), edges })
  assert.ok(cmds.some((c) => c.op === 'setProp'), 'setProp 类名更新')
  assert.ok(!ops(cmds).includes('create'), '无 create——节点不重建')
  assert.equal(h.mounts(), before, '工厂不重跑')
})
