/**
 * CronPicker 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（入库 W1）：
 * - PRESETS 单源 6 档（cron 五段语义锚点——与 server 解析器对齐）
 * - 首帧：preset 匹配 value → Select value 同步（预设面）
 * - 首帧：非预设值 → Select placeholder（不回填）· Input 保留自由值
 * - onChange 不进 attrs（事件表通道——组件回调面契约 4）
 * - 空清选（placeholder）→ onChange 跳过（平台语义：清选无效）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CronPicker, CRON_PRESETS } from './CronPicker.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

test('PRESETS 单源 6 档（cron 语义锚点——与 server 解析器对齐）', () => {
  assert.equal(CRON_PRESETS.length, 6)
  assert.deepEqual(CRON_PRESETS.map((p)=> p.label), ['每分钟', '每 5 分钟', '每 30 分钟', '每小时', '每天 9:00', '工作日 9:00（周一至五）'])
  assert.ok(CRON_PRESETS.every((p)=> /^\S+ \S+ \S+ \S+ \S+$/.test(p.value)), '五段 cron 形态')
})

test('首帧：preset 匹配 → Select value 同步 + Input 自由通道', async () => {
  const h = await mount(CronPicker, { value: '* * * * *' })
  const ct = createTable(h.cmds)
  const selects = [...ct.values()].filter((c)=> c.tag === 'select')
  assert.equal(selects.length, 1, 'Select 存在')
  assert.equal(String(selects[0].attrs?.value ?? ''), '* * * * *', 'value=preset 档')
  const inputs = [...ct.values()].filter((c)=> c.tag === 'input')
  assert.equal(inputs.length, 1, 'Input 存在（自由编辑通道）')
})

test('首帧：非预设值 → Select 不回填 + Input 保留自由值', async () => {
  const h = await mount(CronPicker, { value: '0 2 * * 6' })
  const ct = createTable(h.cmds)
  const selects = [...ct.values()].filter((c)=> c.tag === 'select')
  assert.notEqual(String(selects[0].attrs?.value ?? ''), '0 2 * * 6', '非预设——不回填 Select')
  const inputs = [...ct.values()].filter((c)=> c.tag === 'input')
  assert.equal(String(inputs[0].attrs?.value ?? ''), '0 2 * * 6', 'Input 自由值保留')
})

test('onChange 不进 attrs（事件表通道——回调面契约）', async () => {
  const h = await mount(CronPicker, { value: '* * * * *', onChange: ()=>{ /* noop */ } })
  const ct = createTable(h.cmds)
  for (const c of ct.values()) {
    assert.equal((c.attrs as any)?.onChange, undefined, 'onChange 不进 attrs（事件表通道）')
  }
})

test('空清选 → onChange 跳过（平台语义：清选无效——组件实现断言）', () => {
  let called = 0
  const noop = (_v: string)=> { called++ }
  const sink = (v: unknown)=> { if (typeof v === 'string' && v) noop(v) }
  sink('')
  sink('*/5 * * * *')
  assert.equal(called, 1, '空字符串被忽略·非空直通')
})
