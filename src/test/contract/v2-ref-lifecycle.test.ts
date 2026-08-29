/**
 * vdom v2 — ref 生命周期验证（ref/unref 对称——命令流等价 + 消费端共享）
 *
 * 缺口 4：ref 生命周期 = 命令流等价（v2 同构命令 → 共享 RefRegistry——
 * ref(null) 由 remove/done 消费端触发——引擎无关）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { diffStream } from '../../client/vdom/core/diff/index.ts'
import { diffV2, type SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { Observable } from '../../client/vdom/observable/index.ts'

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

test('ref 生命周期：ref 函数变化（重绑——prev 传递）', async () => {
  const oldT = h('div', {}, h('input', { ref: (el: unknown) => void el, 'data-k': '1' })) as VNode
  const newT = h('div', {}, h('input', { ref: (el: unknown) => void el, 'data-k': '2' })) as VNode
  const d = sameCmds(await collectV1(oldT, newT), await collectV2(oldT, newT))
  assert.equal(d, null, d ?? '')
})

test('ref 生命周期：ref 移除（函数键差集——setProp undefined + prev）', async () => {
  const oldT = h('div', {}, h('input', { ref: (el: unknown) => void el })) as VNode
  const newT = h('div', {}, h('input', {})) as VNode
  const d = sameCmds(await collectV1(oldT, newT), await collectV2(oldT, newT))
  assert.equal(d, null, d ?? '')
})

test('ref 生命周期：元素移除（remove → 消费端 ref(null) 前缀）', async () => {
  const oldT = h('div', {}, [h('input', { ref: (el: unknown) => void el }), h('span', {}, 'x')]) as VNode
  const newT = h('div', {}, [h('span', {}, 'x')]) as VNode
  const d = sameCmds(await collectV1(oldT, newT), await collectV2(oldT, newT))
  assert.equal(d, null, d ?? '')
})

test('ref 生命周期：ref 指令位置（insert 后——挂载完成触发）', async () => {
  const refFn = (el: unknown) => void el
  const root = h('div', {}, [h('input', { ref: refFn }), h('button', {}, 'b')]) as VNode
  // 渲染层（build）——ref 指令在 insert 后
  const { renderToStream } = await import('../../client/vdom/core/build.ts')
  const { renderV2 } = await import('../../client/vdom/core/v2/render.ts')
  async function cV1() { const o: Command[] = []; for await (const c of renderToStream(root, emptyCtx, createComponentRegistry())) o.push(c); return o }
  const v2: Command[] = []
  await new Promise((res) => renderV2(root, emptyCtx, createComponentRegistry()).subscribe({
    next: (c) => v2.push(c), complete: () => res(),
  }))
  const d = sameCmds(await cV1(), v2)
  assert.equal(d, null, d ?? '')
})
