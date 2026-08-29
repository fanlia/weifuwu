/**
 * vdom v2 — 段化 hooks 渲染链最小复现（requestRender 透传）
 *
 * 复现目标（小范围）：v2 段化渲染的组件——hooks 订阅（useExternal/
 * useScrollPosition 类）——值变化 → 段的 requestRender 回调必须触发。
 * 当前失败假设：renderV2 的 requestRender 未透传到段（段回调断链——
 * Affix static 的真实根因）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { renderV2 } from '../../client/vdom/core/v2/render.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import { createStore } from '../../client/vdom/store.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

function collect(o: import('../../client/vdom/observable/index.ts').Observable<Command>): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    o.subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
  })
}

test('最小复现：段化渲染 → hooks 订阅（useExternal）→ store 变化 → requestRender 回调', async () => {
  const store = createStore({ v: 0 })
  let cb = 0
  const Comp: any = (_p: any, ctx: any) => {
    const v = ctx.ui.useExternal(store) // 段 hooks 订阅
    return () => h('div', { 'data-v': String(v().v) }, String(v().v))
  }
  const segments = new Map<string, never>() as never
  await collect(renderV2(h(Comp, {}), emptyCtx, createComponentRegistry(), segments, () => cb++))
  assert.equal(cb, 0, '挂载期无变化——回调 0')
  store.set({ v: 1 }) // hooks 值变化 → 段 requestRender
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(cb, 1, `hooks 变化 → requestRender 回调必须触发（实际 ${cb}——段回调断链）`)
})

test('最小复现：段化渲染 → useObservable 订阅 → 值变化 → 回调（scroll 类）', async () => {
  const { Subject } = await import('../../client/vdom/observable/index.ts')
  const src = new Subject<number>()
  let cb = 0
  let last: number | null = null
  const Comp: any = (_p: any, ctx: any) => {
    const v = ctx.ui.useObservable(src.asObservable(), 0)
    return () => { last = v(); return h('div', {}, String(v())) }
  }
  const segments = new Map<string, never>() as never
  await collect(renderV2(h(Comp, {}), emptyCtx, createComponentRegistry(), segments, () => cb++))
  src.next(1) // 值变化
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(cb, 1, `Observable 变化 → 回调（实际 ${cb}）——getter 值更新由渲染循环驱动（非本测试范围）`)
})

test('回归：嵌套组件（元素/碎片/数组内）——hooks 变化必须触发回调（requestRender 透传——2027-08 实证修复）', async () => {
  const { Subject } = await import('../../client/vdom/observable/index.ts')
  const src = new Subject<number>()
  let cb = 0
  const Comp: any = (_p: any, ctx: any) => {
    const v = ctx.ui.useObservable(src.asObservable(), 0)
    return () => h('div', { 'data-v': String(v()) }, String(v()))
  }
  const Nested: any = (_p: any, ctx: any) => {
    return () => h('div', { class: 'wrap' }, [
      h('div', { class: 'mid' },
        h('p', { class: 'leaf' }, h(Comp, {})),
      ),
    ])
  }
  // 三层嵌套：root 组件 → 元素 → 元素 → 组件（段在元素递归之下——透传断链复现）
  const segments = new Map<string, never>() as never
  await collect(renderV2(h(Nested, {}), emptyCtx, createComponentRegistry(), segments, () => cb++))
  assert.equal(cb, 0, '挂载期无变化')
  src.next(7)
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(cb, 1, `嵌套组件 hooks 变化必须触发回调（实际 ${cb}——元素/碎片递归未透传 requestRender）`)
})
