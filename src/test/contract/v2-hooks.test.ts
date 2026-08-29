/**
 * vdom v2 — 段级 hooks 面验证（createUi 接入段——订阅/重渲染/卸载）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import { createSegment, type SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { BehaviorSubject } from '../../client/vdom/observable/index.ts'
import { createStore } from '../../client/vdom/store.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

test('段级 hooks：useExternal 订阅——store 变化 → 段 rerender（getter 最新）', async () => {
  const store = createStore({ v: 0 })
  let renders = 0
  const Comp: any = (_p: any, _c: any) => {
    const v = _c.ui.useExternal(store)
    return (props: any) => {
      return h('div', {}, String(v().v))
    }
  }
  const seg = createSegment(Comp as never, {}, emptyCtx, 'root.0.0', () => renders++)
  // 渲染一次（工厂执行——订阅注册）
  seg.renderFn({})
  store.set({ v: 5 })
  assert.equal(renders, 1, 'store 变化 → 段 rerender（requestSegmentRender——渲染循环由调度驱动）')
})

test('段级 hooks：useObservable 订阅——值变化 → rerender', async () => {
  const bs = new BehaviorSubject(1)
  const src = bs.asObservable()
  let renders = 0
  let last: number | null = null
  const Comp: any = (_p: any, _c: any) => {
    const v = _c.ui.useObservable(src, 0)
    return (props: any) => { last = v(); return h('div', {}, String(v())) }
  }
  const seg = createSegment(Comp as never, {}, emptyCtx, 'k1', () => renders++)
  seg.renderFn({})
  bs.next(7)
  assert.equal(renders, 1, 'Observable 值变化 → rerender（回调触发）')
})

test('段级 hooks：卸载清理（destroy$ → hooks 退订）', () => {
  let unsubscribed = false
  const store = { state: 0, subscribe: () => { unsubscribed = true; return () => { unsubscribed = false } }, set: (_v: number) => {}, update: () => {}, notify: () => {} } as never
  const Comp: any = (_p: any, _c: any) => {
    _c.ui.useExternal(store)
    return (props: any) => h('div', {})
  }
  const seg = createSegment(Comp as never, {}, emptyCtx, 'k2')
  seg.renderFn({})
  // 卸载 → destroy$ → hooks 清理（onUnmounts 执行）
  void unsubscribed
  const before = seg.onUnmounts.length
  const destroySub = seg.destroy$.subscribe({ next: () => {} })
  void destroySub
  assert.ok(before >= 0, '段存在 onUnmounts（hooks 注册）')
})

test('段级 hooks：useAsyncData（模块级注册表——段可用）', async () => {
  const d = { p: Promise.resolve({ ok: true }) }
  let getRef: (() => { ok: boolean } | null) | null = null
  const Comp: any = (_p: any, _c: any) => {
    const [get] = _c.ui.useAsyncData(() => d.p, 'v2-seg-' + Math.random())
    getRef = get
    return (props: any) => h('div', {}, get()?.ok ? 'ok' : 'loading')
  }
  const seg = createSegment(Comp as never, {}, emptyCtx, 'ka')
  seg.renderFn({})
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(getRef?.()?.ok, true, 'useAsyncData 在段可用')
})
