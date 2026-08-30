/**
 * SegmentedControl 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * 锁定（2026-12 key 纪律专项）：
 * - 首帧：选项按钮 aria-pressed 面 + group role
 * - key 通道（2026-12 补——选项原先无 key）：选项中间插入 → move 命令 +
 *   单一 create（keyed diff 身份跟随——unkeyed 位置对照会全列 setProp 抖动）
 * - 受控回流：value 变化 → aria-pressed 就地切换（不重建）
 *
 * 运行：node --env-file=.env --test src/client/components/SegmentedControl/SegmentedControl.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SegmentedControl } from './SegmentedControl.ts'
import { mount, ops, createTable } from '../../../test/contract/component-harness.ts'

const opts = (values: string[]) => values.map((v) => ({ value: v, label: v.toUpperCase() }))

test('首帧：group role + 选项按钮 aria-pressed 面', async () => {
  const h = await mount(SegmentedControl, { options: opts(['a', 'b', 'c']), value: 'b' })
  const ct = createTable(h.cmds)
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
  const group = [...ct.values()].find((n) => n.attrs.role === 'group')
  assert.ok(group, 'role=group 容器')
  const btns = [...ct.values()].filter((n) => String(n.attrs.class ?? '').includes('wf-segmented-option'))
  assert.equal(btns.length, 3, '3 选项按钮')
  const pressed = btns.filter((n) => n.attrs['aria-pressed'] === 'true')
  assert.equal(pressed.length, 1, '恰 1 个激活')
})

test('选项中间插入 → move + 单一 create（key 身份跟随——key 通道锁定）', async () => {
  const h = await mount(SegmentedControl, { options: opts(['a', 'b', 'c']), value: 'a' })
  const cmds = await h.render({ options: opts(['a', 'x', 'b', 'c']), value: 'a' })
  assert.ok(cmds.some((c) => c.op === 'move'), `含 move（实际: ${ops(cmds).join(',')}）`)
  const btnCreates = cmds.filter((c) => c.op === 'create' && String((c as any).attrs?.class ?? '').includes('wf-segmented-option'))
  assert.equal(btnCreates.length, 1, `仅 1 按钮 create（实际: ${btnCreates.length}）`)
})

test('受控回流：value 变化 → aria-pressed 就地切换（不重建）', async () => {
  const h = await mount(SegmentedControl, { options: opts(['a', 'b']), value: 'a' })
  const before = h.mounts()
  const cmds = await h.render({ options: opts(['a', 'b']), value: 'b' })
  assert.ok(cmds.some((c) => c.op === 'setProp' && (c as any).key === 'aria-pressed'), 'aria-pressed setProp')
  assert.ok(!ops(cmds).includes('create'), '无 create——按钮不重建')
  assert.equal(h.mounts(), before, '工厂不重跑')
})
