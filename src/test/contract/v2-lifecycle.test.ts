/**
 * vdom v2 — destroy$ 生命周期契约（段级卸载信号——单信号全停——单轨清理）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import type { VNode } from '../../client/vdom/core/vnode.ts'
import { diffV2, createSegment, disposeSegment, type SegmentMap } from '../../client/vdom/core/v2/diff.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { Observable } from '../../client/vdom/observable/index.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

function collectObs(o: Observable<Command>): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    o.subscribe({ next: (c) => out.push(c), error: reject, complete: () => resolve(out) })
  })
}

test('disposeSegment：destroy$ 单信号——onUnmount 栈逆序执行（LIFO）', () => {
  const segs = new Map<string, never>() as unknown as SegmentMap
  const unmounted: string[] = []
  // 注册走真实 API（工厂内 ctx.onUnmount——hooks 时序）——段接口已无
  // onUnmounts 字段（单轨清理——2027-09）
  const seg = createSegment(((_p: any, c: any) => {
    c.onUnmount(() => unmounted.push('a'))
    c.onUnmount(() => unmounted.push('b'))
    return () => h('div', {})
  }) as never, {}, emptyCtx, 'root.0.0')
  segs.set('root.0.0', seg as never)
  let destroyed = 0
  seg.destroy$.subscribe({ next: () => destroyed++ })
  disposeSegment('root.0.0', segs)
  assert.equal(destroyed, 1, 'destroy$ 单信号')
  assert.deepEqual(unmounted, ['b', 'a'], 'onUnmount 逆序（后注册先执行——LIFO）')
  assert.ok(!segs.has('root.0.0'), '段已删除')
})

test('disposeSegment：幂等（重复销毁零副作用——信号单发）', () => {
  const segs = new Map<string, never>() as unknown as SegmentMap
  let runs = 0
  const seg = createSegment(((_p: any, c: any) => {
    c.onUnmount(() => runs++)
    return () => h('div', {})
  }) as never, {}, emptyCtx, 'k1')
  segs.set('k1', seg as never)
  let destroyed = 0
  seg.destroy$.subscribe({ next: () => destroyed++ })
  disposeSegment('k1', segs)
  disposeSegment('k1', segs) // 二次（幂等）
  assert.equal(destroyed, 1)
  assert.equal(runs, 1, 'onUnmount 栈单次执行')
})

test('卸载后段不复用（diff 真移除 → dispose → 新挂载重新创建）', async () => {
  const factoryRuns: number[] = []
  let mk = 0
  const Comp: any = (_p: any, _c: any) => {
    const id = mk++
    factoryRuns.push(id)
    return (props: any) => h('span', { 'data-k': props.k }, props.k)
  }
  const oldT = h('div', {}, [h(Comp, { k: 'a', key: 'a' }), h(Comp, { k: 'b', key: 'b' })]) as VNode
  const newT = h('div', {}, [h(Comp, { k: 'b', key: 'b' })]) as VNode // a 被移除
  const reg = createComponentRegistry()
  const segments = new Map<string, never>() as unknown as SegmentMap
  // 预置段（a/b——工厂各 1 次）
  for (const k of ['a', 'b']) {
    const seg = createSegment(Comp as never, { k }, emptyCtx, `root.0.k${k}`)
    segments.set(`root.0.k${k}`, seg as never)
  }
  const before = factoryRuns.length
  await collectObs(diffV2(oldT, newT, emptyCtx, segments, reg))
  assert.ok(!segments.has('root.0.ka'), '被移除段的段已销毁（dispose——不再复用）')
  assert.ok(segments.has('root.0.kb'), '保留段在（复用）')
  assert.equal(factoryRuns.length, before, 'diff 未重跑工厂（移除路径——无新挂载）')
})
