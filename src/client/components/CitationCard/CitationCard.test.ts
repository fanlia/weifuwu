/**
 * CitationCard 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * 锁定（2026-12 aria 纪律专项——引擎 v2 迁移回归修复的组件面归一）：
 * - 首帧：结构（引用列表 + 折叠按钮 + 溢出计数）+ aria-expanded 显式字符串
 *   （布尔直传依赖引擎归一——作者纪律：写你所想——枚举语义显式 'true'/'false'）
 * - aria 面回归：aria-expanded 不落 boolean（create attrs 序列化面）
 *
 * 运行：node --env-file=.env --test src/client/components/CitationCard/CitationCard.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CitationCard } from './CitationCard.ts'
import { mount, ops, createTable } from '../../../test/contract/component-harness.ts'

const citations = [
  { title: '论文一', url: 'https://a.example/1', snippet: '摘要一' },
  { title: '论文二', url: 'https://a.example/2', snippet: '摘要二' },
  { title: '论文三', url: 'https://a.example/3', snippet: '摘要三' },
]

test('首帧：结构 + aria-expanded 显式字符串（不落 boolean）', async () => {
  const h = await mount(CitationCard, { label: '引用', items: citations })
  const ct = createTable(h.cmds)
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
  const toggle = [...ct.values()].find((n) => String(n.attrs.class ?? '').includes('wf-citation-toggle'))
  assert.ok(toggle, '折叠按钮存在')
  // 作者纪律断言：create 序列化面必须是显式字符串（'false'——折叠初态）
  const expanded = toggle!.attrs['aria-expanded']
  assert.equal(expanded, 'false', `aria-expanded 显式 'false'（实际: ${JSON.stringify(expanded)}）`)
  assert.equal(typeof expanded, 'string', '字符串形态（非 boolean——SSR 空串回归防线）')
})

test('溢出折叠：超过 maxVisible 显示 +N 条更多按钮', async () => {
  const h = await mount(CitationCard, { label: '引用', items: citations, maxVisible: 2 })
  const ct = createTable(h.cmds)
  const texts = h.cmds.filter((c) => c.op === 'createText').map((c) => (c as any).value)
  assert.ok(texts.some((t: string) => t.includes('+1')), `+N 计数存在（实际: ${texts.join(',')}）`)
})
