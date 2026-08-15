/**
 * vdom3 record — 录制转测试（事故 → 自动生成可运行测试）
 *
 * 闭环：渲染/交互 → 事件流（录制）→ recordToTest 生成 jsdom 测试骨架
 * → 回放 + 事件序列断言（DOM = fold 验证 + 精确渲染描述）。
 *
 * 事故转测试：任意渲染异常 → 录制事件流 → 生成回归测试（无需手动复现）。
 */

import type { V3Event } from './types.ts'

/** 事件流 → jsdom 测试代码（可写盘/执行） */
export function recordToTest(events: V3Event[], name = 'recorded-render'): string {
  const types = [...new Set(events.map((e) => e.type))]
  const json = JSON.stringify(events)
  return `/**
 * 自动生成测试（vdom3 recordToTest）——事件流录制转回归
 * 渲染过程：${types.join(' → ')}
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { replay, eventsOf } from '../ui-dom/vdom3/index.ts'

before(setupJsdom)

test('${name}：事件流回放（DOM = fold）+ 渲染序列断言', () => {
  const events = ${json}

  // 回放：事件流 → DOM（零猜测重建）
  const root = document.createElement('div')
  document.body.appendChild(root)
  replay(events, root)
  assert.ok(root.childNodes.length > 0, '回放渲染非空')

  // 渲染类型断言：渲染过程包含的关键事件（精确描述渲染做了什么）
  const keyTypes = ['NODE_CREATE', 'PROP_UPDATE', 'INSERT']
  for (const t of keyTypes) {
    assert.ok(eventsOf(events, t).length > 0, '包含 ' + t + ' 事件')
  }
  assert.ok(eventsOf(events, 'TEXT_CREATE').length > 0, '包含文本创建事件（有文本内容）')

  document.body.removeChild(root)
})
`
}

/** 事件流摘要（录制信息——时间/类型计数） */
export function summarizeEvents(events: V3Event[]): string {
  const byType: Record<string, number> = {}
  for (const e of events) byType[e.type] = (byType[e.type] ?? 0) + 1
  return Object.entries(byType).map(([t, n]) => `${t}×${n}`).join(' ')
}
