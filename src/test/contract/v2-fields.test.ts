/**
 * vdom v2 — 事件/字段面验证（EventRegistry 协同——v2 命令流等价）
 *
 * 缺口 7：事件/ref 字段 = 命令流等价 + 共享 EventRegistry（setProp 的
 * 函数面 prev 传递——解绑重绑——消费端引擎无关）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { diffStream } from '../../client/vdom/core/diff/index.ts'
import { diffV2, type SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

async function collectV1(oldT: VNode, newT: VNode): Promise<Command[]> {
  const out: Command[] = []
  for await (const c of diffStream(oldT, newT, emptyCtx, createComponentRegistry())) out.push(c)
  return out
}

function collectV2(oldT: VNode, newT: VNode): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    diffV2(oldT, newT, emptyCtx, new Map() as unknown as SegmentMap, createComponentRegistry()).subscribe({
      next: (c) => out.push(c), error: reject, complete: () => resolve(out),
    })
  })
}

function sameCmds(a: Command[], b: Command[]): string | null {
  if (a.length !== b.length) return `长度 ${a.length} vs ${b.length}（v1: ${a.map(c => c.op).join(',')} / v2: ${b.map(c => c.op).join(',')}）`
  for (let i = 0; i < a.length; i++) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return `第 ${i} 条:\n  v1: ${JSON.stringify(a[i]).slice(0, 120)}\n  v2: ${JSON.stringify(b[i]).slice(0, 120)}`
  }
  return null
}

test('字段：事件函数变化（prev 传递——解绑重绑）', async () => {
  const oldT = h('button', { onClick: () => {} }, 'x') as VNode
  const newT = h('button', { onClick: () => {} }, 'x') as VNode
  const d = sameCmds(await collectV1(oldT, newT), await collectV2(oldT, newT))
  assert.equal(d, null, d ?? '')
})

test('字段：事件移除（差集——setProp undefined + prev）', async () => {
  const oldT = h('button', { onClick: () => {}, 'data-x': '1' }, 'x') as VNode
  const newT = h('button', { 'data-x': '1' }, 'x') as VNode
  const d = sameCmds(await collectV1(oldT, newT), await collectV2(oldT, newT))
  assert.equal(d, null, d ?? '')
})

test('字段：attr 变化（setProp 只发变化键）', async () => {
  const oldT = h('div', { class: 'a', id: 'x', 'data-k': '1' }, 't') as VNode
  const newT = h('div', { class: 'b', id: 'x' }, 't') as VNode
  const d = sameCmds(await collectV1(oldT, newT), await collectV2(oldT, newT))
  assert.equal(d, null, d ?? '')
})

test('字段：style 对象（setProp——完整替换语义）', async () => {
  const oldT = h('div', { style: { width: '100px', color: 'red' } }, 'x') as VNode
  const newT = h('div', { style: { width: '200px' } }, 'x') as VNode
  const d = sameCmds(await collectV1(oldT, newT), await collectV2(oldT, newT))
  assert.equal(d, null, d ?? '')
})

test('字段：事件在元素移除（remove → 消费端事件清理）', async () => {
  const oldT = h('div', {}, [h('button', { onClick: () => {} }, 'a'), h('span', {}, 'keep')]) as VNode
  const newT = h('div', {}, [h('span', {}, 'keep')]) as VNode
  const d = sameCmds(await collectV1(oldT, newT), await collectV2(oldT, newT))
  assert.equal(d, null, d ?? '')
})

test('字段：多个函数 props（onClick+onMouseEnter 同变）', async () => {
  const oldT = h('button', { onClick: () => {}, onMouseEnter: () => {} }, 'x') as VNode
  const newT = h('button', { onClick: () => {}, onMouseEnter: () => {} }, 'x') as VNode
  const d = sameCmds(await collectV1(oldT, newT), await collectV2(oldT, newT))
  assert.equal(d, null, d ?? '')
})
