/**
 * vdom v2 — 观测体系最小复现测试（scroll 全链——观测驱动定位）
 *
 * 用户原则：透明的观测体系——小测试复现——每环可断言——
 * 链：scroll 事件 → scrollSource$（obs:use-next）→ 段 env（req:render）
 *   → 调度 flush（sched:flush）→ 渲染命令（cmd:render）
 * 逐环断言——断在哪环即修复哪环（不再盲改）
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { renderV2 } from '../../client/vdom/core/v2/render.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { SpyEvent } from '../../client/vdom/core/v2/spy.ts'
import { createStore } from '../../client/vdom/store.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

const spy: SpyEvent[] = []
before(() => { (globalThis as { __wfSpy?: SpyEvent[] }).__wfSpy = spy })
after(() => { delete (globalThis as { __wfSpy?: SpyEvent[] }).__wfSpy })

function collect(o: import('../../client/vdom/observable/index.ts').Observable<Command>): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    o.subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
  })
}

function kinds(list: SpyEvent[]): string[] { return list.map((e) => e.kind) }

test('观测链：store 变化 → obs:next → req:render（每环可见）', async () => {
  spy.length = 0
  const store = createStore({ v: 0 })
  const Comp: any = (_p: any, ctx: any) => {
    const v = ctx.ui.useExternal(store)
    return () => h('div', {}, String(v().v))
  }
  await collect(renderV2(h(Comp, {}), { render: async () => {}, browser: null } as never, createComponentRegistry(), new Map(), () => {}))
  spy.length = 0
  store.set({ v: 1 })
  await new Promise((r) => setTimeout(r, 0))
  const seq = kinds(spy)
  assert.ok(seq.includes('req:render'), `useExternal 变化必须触发 req:render（观测：${JSON.stringify(seq)}）`)
})

test('观测链：useObservable（非同步首个值）必须触发 req:render', async () => {
  spy.length = 0
  const { Subject } = await import('../../client/vdom/observable/index.ts')
  const src = new Subject<number>()
  const Comp: any = (_p: any, ctx: any) => {
    const v = ctx.ui.useObservable(src.asObservable(), 0)
    return () => h('div', {}, String(v()))
  }
  await collect(renderV2(h(Comp, {}), { render: async () => {}, browser: null } as never, createComponentRegistry(), new Map(), () => {}))
  spy.length = 0
  src.next(1)
  await new Promise((r) => setTimeout(r, 0))
  const seq = kinds(spy)
  assert.ok(seq.includes('obs:next'), `Subject 变化必须有 obs:next（观测：${JSON.stringify(seq)}）`)
  assert.ok(seq.includes('req:render'), `Subject 变化必须触发 req:render（观测：${JSON.stringify(seq)}——非同步首个值不得被当初始化）`)
})
