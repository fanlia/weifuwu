/**
 * vdom v2 — 渲染周期契约测试（波次 1：渲染管线化——原子性/度量/可观测）
 *
 * 锁定：
 * - 首帧 build（currentTree null → build——不调 diff）
 * - 后续同型 diff（builds 不变——增量）
 * - 异型根替换（resetRoot + build——旧树清空）
 * - 原子性（生成错误 → 零应用 + 影子树重置——下次全量）
 * - unmount → cleanupOp dispose（命令级）
 * - apply 错误 → break（后续命令跳过——cleanup 仍执行）
 * - applied$/complete$ 发射（sink 可观测——顺序 applied → complete）
 * - active=false → 零副作用（零应用/零 dispose）——unmount 后周期静默
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import type { VNode } from '../../client/vdom/core/vnode.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { fromArray } from '../../client/vdom/core/v2/render.ts'
import { createRenderCycle, type RenderCycle } from '../../client/vdom/core/v2/cycle.ts'

function mkCycle(changes?: {
  boot?: () => void
  resetRoot?: () => void
  failBuild?: boolean
  failApplyAt?: number
  active?: boolean
}): {
  cycle: RenderCycle
  applied: Command[]
  disposed: string[]
  booted: number
  resets: number
  buildCalls: number
  diffCalls: number
} {
  const s = {
    applied: [] as Command[],
    disposed: [] as string[],
    booted: 0,
    resets: 0,
    buildCalls: 0,
    diffCalls: 0,
  }
  const active = () => changes?.active !== false
  const cycle = createRenderCycle({
    boot: () => { s.booted++; changes?.boot?.() },
    resetRoot: () => { s.resets++; changes?.resetRoot?.() },
    build: () => {
      s.buildCalls++
      if (changes?.failBuild) throw new Error('build 失败（生成错误）')
      return fromArray([{ op: 'create', id: 'root.0', tag: 'div' }, { op: 'insert', id: 'root.0', parent: 'root', ref: null }] as Command[])
    },
    diff: () => {
      s.diffCalls++
      return fromArray([
        { op: 'setProp', id: 'root.0', key: 'k', value: 'v' } as Command,
        { op: 'unmount', compId: 'root.0.k1' } as Command,
      ])
    },
    apply: (cmd) => {
      if (changes?.failApplyAt !== undefined && s.applied.length === changes.failApplyAt) throw new Error('apply 失败')
      s.applied.push(cmd)
    },
    dispose: (compId) => { s.disposed.push(compId); return true },
    active,
  })
  ;(s as Record<string, unknown>).cycle = cycle // 活引用（属性随闭包更新）
  return s as unknown as {
    cycle: RenderCycle
    applied: Command[]
    disposed: string[]
    booted: number
    resets: number
    buildCalls: number
    diffCalls: number
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

test('首帧 build（currentTree null → build——不调 diff）+ 后续同型 diff（增量）', async () => {
  const m = mkCycle()
  await m.cycle.apply(h('div', {}))
  assert.equal(m.buildCalls, 1, '首帧 build')
  assert.equal(m.diffCalls, 0, '首帧不 diff')
  assert.equal(m.booted, 1, 'boot 一次')
  await m.cycle.apply(h('div', { a: 1 }))
  assert.equal(m.diffCalls, 1, '后续同型 diff')
  assert.equal(m.buildCalls, 1, '增量不 build')
  const mm = m.cycle.metrics()
  assert.equal(mm.builds, 1)
  assert.equal(mm.diffs, 1)
})

test('异型根替换（resetRoot + build——旧树清空重建）', async () => {
  const m = mkCycle()
  await m.cycle.apply(h('div', {}))
  await m.cycle.apply(h('span', {}))
  assert.equal(m.resets, 1, 'resetRoot（旧树清空）')
  assert.equal(m.buildCalls, 2, '异型 → 全量 build')
  assert.equal(m.diffCalls, 0)
  const mm = m.cycle.metrics()
  assert.equal(mm.builds, 2)
  assert.equal(mm.diffs, 0)
})

test('原子性：生成错误 → 零应用 + 影子树重置（下次全量自愈）', async () => {
  const m = mkCycle({ failBuild: true })
  let threw = false
  try {
    await m.cycle.apply(h('div', {}))
  } catch { threw = true }
  assert.ok(threw, '生成错误应 reject')
  assert.equal(m.applied.length, 0, '生成错误 → 零应用（toArray 原子性）')
  const mm = m.cycle.metrics()
  assert.equal(mm.builds, 1, '错误计一次 build')
  assert.equal(mm.applies, 0)
  // 下次（影子树重置——currentTree null）→ 走 build（非 diff）
  const m2 = mkCycle()
  await m2.cycle.apply(h('div', {}))
  await m2.cycle.apply(h('div', {}))
  assert.equal(m2.diffCalls, 1, '成功周期后正常 diff')
})

test('unmount → cleanupOp dispose（命令级）——applied$ 发射应用后命令', async () => {
  const m = mkCycle()
  const appliedEvents: Command[][] = []
  m.cycle.applied$.subscribe({ next: (c) => appliedEvents.push(c) })
  await m.cycle.apply(h('div', {})) // build（无 unmount）
  await m.cycle.apply(h('div', {})) // diff（含 unmount——unmount 在 diff 流）
  assert.deepEqual(m.disposed, ['root.0.k1'], 'unmount → dispose（cleanupOp）')
  assert.equal(appliedEvents.length, 2, '每周期 applied$ 一值')
  assert.ok(appliedEvents[1].some((c) => c.op === 'unmount'), 'applied$ 含应用后命令')
  const mm = m.cycle.metrics()
  assert.equal(mm.unmounts, 1)
})

test('apply 错误 → break（后续命令跳过——cleanup 仍执行——周期完成）', async () => {
  let applied = 0
  let disposed: string[] = []
  const cycle = createRenderCycle({
    boot: () => {},
    resetRoot: () => {},
    build: () => fromArray([
      { op: 'create', id: 'root.0', tag: 'div' } as Command,
      { op: 'unmount', compId: 'k1' } as Command,
      { op: 'setProp', id: 'root.0', key: 'a', value: '1' } as Command,
    ]),
    diff: () => fromArray([] as Command[]),
    apply: () => {
      applied++
      if (applied === 1) throw new Error('apply 失败')
    },
    dispose: (cid) => { disposed.push(cid); return true },
    active: () => true,
  })
  let completed = 0
  cycle.complete$.subscribe({ next: () => completed++ })
  await cycle.apply(h('div', {}))
  assert.equal(applied, 1, '首个失败——后续跳过（break 语义）')
  assert.deepEqual(disposed, ['k1'], 'cleanup 仍执行（不因 apply 错误跳过）')
  assert.equal(completed, 1, '周期完成（错误不终结周期——currentTree 推进现有语义）')
})

test('active=false → 零副作用（unmount 后周期静默）', async () => {
  const m = mkCycle({ active: false })
  await m.cycle.apply(h('div', {}))
  assert.equal(m.applied.length, 0, '零应用')
  assert.equal(m.disposed.length, 0, '零 dispose')
  assert.equal(m.buildCalls, 0, '零 build')
  assert.equal(m.booted, 0, '零 boot')
})

test('applied$ → complete$ 顺序（sink 可观测——afterRender 冲刷点）', async () => {
  const m = mkCycle()
  const order: string[] = []
  m.cycle.applied$.subscribe({ next: () => order.push('applied') })
  m.cycle.complete$.subscribe({ next: () => order.push('complete') })
  await m.cycle.apply(h('div', {}))
  await flush()
  assert.deepEqual(order, ['applied', 'complete'])
})
