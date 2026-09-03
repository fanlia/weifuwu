/**
 * vdom memo（opt-in shouldRender）契约——2027-09 vdom 渲染增强 W2
 *
 * 语义定版：
 *   1) 无 shouldRender：默认行为完全不变（全量兼容）
 *   2) shouldRender 返回 false → 复用上拍输出（引用 same → diff 短路零命令）
 *   3) shouldRender true / props 变化 → 正常重渲染
 *   4) lastProps 不更新语义：跳过再跳过（同引用恒跳过）
 *   5) 引用短路安全性：同引用 vnode 零命令（不可变约定）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { renderToStreamV2, diffToStreamV2 } from '../../client/vdom/core/v2/integrate.ts'
import type { Component, RenderFn } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/types.ts'
import type { Segment } from '../../client/vdom/core/v2/diff.ts'

/** 收集命令流（返回 commands——断言零命令） */
async function drainStream(stream: ReadableStream<Command>): Promise<Command[]> {
  const out: Command[] = []
  const r = stream.getReader()
  while (true) { const { value, done } = await r.read(); if (done) break; out.push(value) }
  return out
}

/** 计数 renderFn 调用（shouldRender 挂载验证） */
let renderCalls = 0
const makeRender = (): (RenderFn & { shouldRender?: (a: any, b: any) => boolean }) => {
  const render = ((_props: Record<string, unknown>) => {
    renderCalls++
    return h('div', {}, 'x')
  }) as ReturnType<typeof makeRender>
  render.shouldRender = (a, b) => a.msg !== b.msg // false（msg 同）= 跳过
  return render
}

test('memo：shouldRender false → 复用上拍输出（零命令）', async () => {
  renderCalls = 0
  const Comp = ((_init: unknown, _ctx: unknown) => makeRender()) as unknown as Component
  const segs = new Map<string, Segment>()
  const oldT = h('div', {}, [h(Comp, { msg: 'same' })]) as VNode
  const newT = h('div', {}, [h(Comp, { msg: 'same' })]) as VNode
  await drainStream(renderToStreamV2(oldT, {}, undefined, segs))
  const before = renderCalls
  const cmds = await drainStream(diffToStreamV2(oldT, newT, {}, undefined, segs))
  assert.equal(renderCalls, before, 'shouldRender=false → renderFn 未重跑')
  assert.equal(cmds.filter((c) => c.op !== 'done').length, 0, 'diff 零 DOM 命令（输出复用——done 为流结束标记）')
})

test('memo：props 变化 → 正常重渲染（命令产生）', async () => {
  renderCalls = 0
  const Comp = ((_init: unknown, _ctx: unknown) => makeRender()) as unknown as Component
  const segs = new Map<string, Segment>()
  const oldT = h('div', {}, [h(Comp, { msg: 'a' })]) as VNode
  const newT = h('div', {}, [h(Comp, { msg: 'b' })]) as VNode
  await drainStream(renderToStreamV2(oldT, {}, undefined, segs))
  const before = renderCalls
  const cmds = await drainStream(diffToStreamV2(oldT, newT, {}, undefined, segs))
  assert.equal(renderCalls, before + 1, 'props 变化 → renderFn 重跑')
  assert.ok(cmds.length > 0, '输出变化 → 命令产生')
})

test('memo：无 shouldRender → 默认行为不变（每次重渲染）', async () => {
  renderCalls = 0
  const Comp = ((_init: unknown, _ctx: unknown) => () => { renderCalls++; return h('div', {}, 'x') }) as unknown as Component
  const segs = new Map<string, Segment>()
  const oldT = h('div', {}, [h(Comp, { msg: 'same' })]) as VNode
  const newT = h('div', {}, [h(Comp, { msg: 'same' })]) as VNode
  await drainStream(renderToStreamV2(oldT, {}, undefined, segs))
  const before = renderCalls
  await drainStream(diffToStreamV2(oldT, newT, {}, undefined, segs))
  assert.equal(renderCalls, before + 1, '默认每次重渲染')
})

test('memo：跳过多次（lastProps 不更新——同引用恒跳）', async () => {
  renderCalls = 0
  const Comp = ((_init: unknown, _ctx: unknown) => makeRender()) as unknown as Component
  const segs = new Map<string, Segment>()
  const t1 = h('div', {}, [h(Comp, { msg: 'same' })]) as VNode
  const t2 = h('div', {}, [h(Comp, { msg: 'same' })]) as VNode
  const t3 = h('div', {}, [h(Comp, { msg: 'same' })]) as VNode
  await drainStream(renderToStreamV2(t1, {}, undefined, segs))
  await drainStream(diffToStreamV2(t1, t2, {}, undefined, segs))
  const before = renderCalls
  await drainStream(diffToStreamV2(t2, t3, {}, undefined, segs))
  assert.equal(renderCalls, before, '连续跳过（第三拍也不重渲染）')
})
