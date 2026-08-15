/**
 * vdom3 record — 录制转测试（事故 → 自动生成可运行测试）
 *
 * 闭环：渲染/交互 → 事件流（录制）→ recordToTest 生成 jsdom 测试骨架
 * → 回放 + 事件序列断言（DOM = fold 验证 + 精确渲染描述）。
 *
 * 事故转测试：任意渲染异常 → 录制事件流 → 生成回归测试（无需手动复现）。
 *
 * 事件统一命名：对象 + 动作 + 参数（entity + action + target + payload）——
 * 键格式 `entity:action`（如 'node:create' / 'comp:render'）。
 */

import type { V3Event } from './types.ts'

/** 事件键（entity:action） */
function key(e: V3Event): string {
  return `${e.entity}:${e.action}`
}

/** 事件流 → jsdom 测试代码（可写盘/执行） */
export function recordToTest(events: V3Event[], name = 'recorded-render'): string {
  const types = [...new Set(events.map(key))]
  // 内容断言：重建 DOM 的 tag 计数——DOM = fold(事件流) 的直接验证：
  // 最终 tag 计数 = NODE_CREATE − REMOVE 子树（折叠语义——移除父节点隐含移除后代）
  const idTag = new Map<string, string>()
  for (const e of events) {
    if (key(e) === 'node:create') idTag.set(e.target!, (e.payload as { tag: string }).tag)
  }
  const childrenOf = new Map<string, string[]>()
  for (const e of events) {
    if (key(e) === 'node:insert') {
      const pl = e.payload as { parent: string }
      const arr = childrenOf.get(pl.parent) ?? []
      arr.push(e.target!)
      childrenOf.set(pl.parent, arr)
    }
  }
  const removedSet = new Set<string>()
  const addTree = (id: string): void => {
    removedSet.add(id)
    for (const c of childrenOf.get(id) ?? []) addTree(c)
  }
  for (const e of events) if (key(e) === 'node:remove') addTree(e.target!)
  const tagCounts = new Map<string, number>()
  for (const [id, tag] of idTag) {
    if (removedSet.has(id)) continue
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const tagAssertions = [...tagCounts.entries()]
    .map(([tag, n]) => `  assert.equal(root.querySelectorAll('${tag}').length, ${n}, '${tag} × ${n}（事件流推导）')`)
    .join('\n')
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

  // 内容断言：tag 计数与录制一致（DOM = fold 直接验证）
${tagAssertions}

  // 渲染类型断言：渲染过程包含的关键事件（精确描述渲染做了什么）
  const keyTypes = ['node:create', 'prop:update', 'node:insert']
  for (const t of keyTypes) {
    assert.ok(eventsOf(events, t).length > 0, '包含 ' + t + ' 事件')
  }
  assert.ok(eventsOf(events, 'text:create').length > 0, '包含文本创建事件（有文本内容）')

  document.body.removeChild(root)
})
`
}

/** 事件流摘要（录制信息——时间/类型计数） */
export function summarizeEvents(events: V3Event[]): string {
  const byType: Record<string, number> = {}
  for (const e of events) byType[key(e)] = (byType[key(e)] ?? 0) + 1
  return Object.entries(byType).map(([t, n]) => `${t}×${n}`).join(' ')
}
