/**
 * diff 回归：数组尾部连续新增（旧 children 短于新）必须按序 append——
 * posHoleReal 的插入点解析不得用「旧节点 nextSibling」覆盖「父末尾 append」。
 *
 * 根因（components-demo 搜索恢复实测 2026-12）：Section 搜索过滤把分组从
 * [Input] 恢复为 [Button, Input, Textarea, Select, Select-s] 时——
 * posHoleReal i=2 的插入点解析：out 尾部（刚 append 的 Input）nextSibling === null
 * 表示「父末尾——append 正确」，但旧代码 `if (!next)` 把它当「未找到锚点」，
 * 走旧节点兜底（oldNodes[0] 已被顶到前方）的 nextSibling → 后续新增全部插到
 * Input 前 → 卡片顺序错乱（Button, Textarea, Select, Select-s, Input）。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from './client/setup.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { mountCommand } from '../ui-dom/context.ts'
import { patchValue } from '../ui-dom/vdom2/patch.ts'
import { h } from '../ui-dom/vnode.ts'

setupJsdom()
const browser = createClientBrowser()

function fakeCtx() {
  return { ui: { $: {}, dirty: () => {}, render: () => {}, ready: true } }
}

describe('diff: 数组尾部连续新增顺序', () => {
  it('旧 children 1 项 → 新 5 项：连续 append 不得串位（搜索恢复场景）', async () => {
    const ctx = fakeCtx()
    const container = browser.createElement('div')

    const prev = h('div', {},
      h('div', { id: 'a' }, 'a'),
    )
    await mountCommand(container, prev, ctx)

    const next = h('div', {},
      h('div', { id: 'a2' }, 'a2'),
      h('div', { id: 'b' }, 'b'),
      h('div', { id: 'c' }, 'c'),
      h('div', { id: 'd' }, 'd'),
      h('div', { id: 'e' }, 'e'),
    )
    patchValue(container, container.firstChild, prev, next, { browser: ctx.browser, registry: (ctx as any).__registry })

    const order = [...(container.firstChild as Element).children].map((n) => n.id)
    assert.deepEqual(order, ['a2', 'b', 'c', 'd', 'e'], '尾部新增按序 append，位置不得错乱')
  })

  it('连续两轮恢复（1→3→5）不累积错位', async () => {
    const ctx = fakeCtx()
    const container = browser.createElement('div')

    const round1 = h('div', {}, h('div', { id: 'a' }, 'a'))
    await mountCommand(container, round1, ctx)

    const round2 = h('div', {},
      h('div', { id: 'a2' }, 'a2'),
      h('div', { id: 'b' }, 'b'),
      h('div', { id: 'c' }, 'c'),
    )
    patchValue(container, container.firstChild, round1, round2, { browser: ctx.browser, registry: (ctx as any).__registry })
    assert.deepEqual([...(container.firstChild as Element).children].map((n) => n.id), ['a2', 'b', 'c'])

    const round3 = h('div', {},
      h('div', { id: 'a3' }, 'a3'),
      h('div', { id: 'b2' }, 'b2'),
      h('div', { id: 'c2' }, 'c2'),
      h('div', { id: 'd' }, 'd'),
      h('div', { id: 'e' }, 'e'),
    )
    patchValue(container, container.firstChild, round2, round3, { browser: ctx.browser, registry: (ctx as any).__registry })
    assert.deepEqual([...(container.firstChild as Element).children].map((n) => n.id), ['a3', 'b2', 'c2', 'd', 'e'])
  })
})
