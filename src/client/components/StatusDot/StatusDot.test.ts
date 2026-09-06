/**
 * StatusDot 组件契约测试——命令流级断言（零浏览器）
 *
 * 锁定（入库 W1——语言化契约）：
 * - label 缺省 → 只渲染点（文字是调用方职责——防双标签）
 * - on 主开关：true→success · false→default（tone 缺省推导）
 * - tone 覆盖：warning/error 显式传 → 点色 + 文字色同步
 * - label 提供 → 文字随 tone 变色（wf-text-* 单源）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StatusDot } from './StatusDot.ts'
import { mount, createTable } from '../../../test/contract/component-harness.ts'

function dotClass(h: { cmds: any[] }): string {
  const ct = createTable(h.cmds)
  const dot = [...ct.values()].find((c)=> String(c.attrs?.class ?? '').includes('wf-badge-dot'))
  return String(dot?.attrs?.class ?? '')
}

test('label 缺省 → 只渲染点（无文字——防双标签）', async () => {
  const h = await mount(StatusDot, { on: true })
  const texts = h.cmds.filter((c)=> c.op === 'createText').map((c: any)=> c.value)
  assert.equal(texts.length, 0, '无文字渲染')
  assert.ok(dotClass(h).includes('wf-badge-dot'), '点存在')
})

test('on 主开关：true→success · false→default', async () => {
  const on = await mount(StatusDot, { on: true })
  assert.ok(dotClass(on).includes('wf-badge-dot--success'), 'on→success')
  const off = await mount(StatusDot, { on: false })
  assert.ok(dotClass(off).includes('wf-badge-dot--default'), 'off→default')
})

test('tone 覆盖：warning/error 显式传 → 点色同步', async () => {
  const w = await mount(StatusDot, { on: true, tone: 'warning' })
  assert.ok(dotClass(w).includes('wf-badge-dot--warning'), 'tone 覆盖点色')
  const e = await mount(StatusDot, { on: false, tone: 'error' })
  assert.ok(dotClass(e).includes('wf-badge-dot--error'), 'off+tone=error')
})

test('label 提供 → 文字随 tone 变色（wf-text-* 单源）', async () => {
  const h = await mount(StatusDot, { on: true, label: '运行中' })
  const ct = createTable(h.cmds)
  const textEl = [...ct.values()].find((c)=> c.tag === 'span' && String(c.attrs?.class ?? '').includes('wf-text-success'))
  assert.ok(textEl, 'success 文字类')
  const texts = h.cmds.filter((c)=> c.op === 'createText').map((c: any)=> c.value)
  assert.ok(texts.includes('运行中'), 'label 渲染')
})

test('缺省：无 props → default 点（非活跃）', async () => {
  const h = await mount(StatusDot, {})
  assert.ok(dotClass(h).includes('wf-badge-dot--default'), '缺省 default')
})
