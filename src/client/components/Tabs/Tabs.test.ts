/**
 * Tabs 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（受控 + keyed 列表 + 渲染期 hook）：
 * - items 渲染为 keyed 按钮列表（keyedId——身份映射——非位置）
 * - 受控纪律：closable 缺 onClose → warn（静默不可点防护）
 * - useControlled 渲染期 hook 消费（mount 阶段后 idx——无串位）
 * - 受控回流：active 变化 → setProp class（tab 激活态就地切换）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Tabs } from './Tabs.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

const ITEMS = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
]

test('keyed 列表：tab 按钮元素 keyed（位置 id + diff remap——组件才 .k{key} 空间）', async () => {
  const h = await mount(Tabs, { items: ITEMS, active: 'a' })
  const ct = createTable(h.cmds)
  // 元素 keyed = 位置 id（框架语义——keyed 价值在 diff 移动正确性——
  // .k{key} 是组件实例空间）——断言 keyed 分类行为（diff 不重建 + 身份保持）
  const btnIds = [...ct.entries()].filter(([, v]) => v.tag === 'button' && (v.attrs.role === 'tab' || v.attrs['aria-selected'])).map(([id]) => id)
  assert.ok(btnIds.length >= 2, `tab 按钮 ≥2（实际: ${btnIds.length}）`)
  const activeBtn = [...ct.entries()].find(([, v]) => v.tag === 'button' && v.attrs['aria-selected'] === 'true')
  assert.ok(activeBtn, '激活 tab aria-selected=true')
  assert.equal(activeBtn![1].attrs.tabindex, 0, 'roving tabindex 激活 0')
  // 受控回流：active a→b——tab 不重建（keyed 身份保持——位置不动）
  const cmds = await h.render({ items: ITEMS, active: 'b' })
  assert.ok(!cmds.some((c) => c.op === 'create' && (c as any).tag === 'button'), 'tab 按钮不重建')
})

test('受控纪律：closable 缺 onClose → warn（静默不可点防护）', async () => {
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: unknown) => { warns.push(String(m)) }
  try {
    await mount(Tabs, { items: ITEMS, closable: true })
    assert.ok(warns.some((w) => w.includes('[Tabs] closable 未配 onClose')), 'closable 缺回调 warn')
  } finally {
    console.warn = origWarn
  }
})

test('受控回流：active a→b → setProp class/aria（tab 激活就地切换——不重建）', async () => {
  const h = await mount(Tabs, { items: ITEMS, active: 'a' })
  const cmds = await h.render({ items: ITEMS, active: 'b' })
  assert.ok(cmds.some((c) => c.op === 'setProp'), '激活态 setProp（就地）')
  assert.ok(!cmds.some((c) => c.op === 'create' && (c as any).tag === 'button'), 'tab 按钮不重建')
})

test('空 items → null 输出（组件输出空洞——锚处理）', async () => {
  const h = await mount(Tabs, { items: [] })
  // Tabs 空 items 返回 null——组件输出 hole（compId.0 锚）
  assert.ok(h.cmds.some((c) => c.op === 'createAnchor'), '空列表输出锚（无面板残留）')
})
