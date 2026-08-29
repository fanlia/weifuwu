/**
 * vdom dev — 渲染健康诊断器契约（RENDER-HEALTH-PLAN 波次 1——三轴读数）
 *
 * 锁定：
 * - 频率轴：complete$ 计数（窗口滚动——refresh 归零）
 * - 规模轴：applied$ cmds.length（last/max——累计）
 * - 复用轴：spy 事件聚合（seg:create / seg:reuse——重跑率）
 * - snapshot 形态（__wfRenderHealth 数据面——段数/总量/告警）
 * - 阈值 warn（频率超限/规模超限/复用率不足——dev 红线）
 * - dispose 停窗（timer 清理）
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { Subject } from '../../client/vdom/observable/index.ts'
import { createRenderHealth } from '../../client/vdom/dev/render-health.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

const all: ReturnType<typeof createRenderHealth>[] = []
after(() => { for (const h of all) h.dispose() })

function mk(cmdCount = 0) {
  const applied = new Subject<Command[]>()
  const complete = new Subject<void>()
  const spy: { kind: string }[] = []
  const health = createRenderHealth(applied.asObservable(), complete.asObservable(), new Map(), () => spy)
  all.push(health)
  return { health, applied, complete, spy }
}

test('三轴计数：频率（complete 计数）+ 规模（applied 命令数）+ 累计', () => {
  const { health, applied, complete } = mk()
  const cmds = Array.from({ length: 7 }, () => ({ op: 'create', id: 'x', tag: 'div' } as Command))
  applied.next(cmds)
  complete.next()
  applied.next(cmds.slice(0, 2))
  complete.next()
  const s = health.snapshot()
  assert.equal(s.lastCmds, 2, '规模轴：上次命令数')
  assert.equal(s.maxCmds, 7, '规模轴：最大命令数')
  assert.equal(s.total.renders, 2, '频率轴：渲染累计')
  assert.equal(s.total.cmds, 9, '累计命令')
})

test('复用轴：spy 聚合（seg:create / seg:reuse——重跑率）', () => {
  const { health, spy } = mk()
  spy.push({ kind: 'seg:create' }, { kind: 'seg:create' }, { kind: 'seg:reuse' }, { kind: 'seg:reuse' }, { kind: 'seg:reuse' })
  const s = health.snapshot()
  assert.equal(s.total.creates, 2, '工厂重跑（新段）数')
  assert.equal(s.total.reuses, 3, '复用段数')
  assert.ok(Math.abs(s.reRunRate - 0.4) < 1e-9, `重跑率 0.4（40%）——${s.reRunRate}`)
})

test('refresh：窗口滚动（频率窗归零——累计保留）', () => {
  const { health, complete } = mk()
  complete.next()
  complete.next()
  const before = health.snapshot()
  assert.equal(before.fps, 1, '窗口内 2 次/2s = 1/s')
  health.refresh()
  const after = health.snapshot()
  assert.equal(after.fps, 0, '刷新后窗口归零')
  assert.equal(after.total.renders, 2, '累计保留')
})

test('阈值 warn：频率/规模/复用率超限（dev 红线）', () => {
  const { health, applied, complete, spy } = mk()
  const big = Array.from({ length: 6000 }, () => ({ op: 'create', id: 'x', tag: 'div' } as Command))
  applied.next(big)
  complete.next()
  spy.push({ kind: 'seg:create' }, { kind: 'seg:create' }, { kind: 'seg:create' }) // 100% 重跑
  health.refresh()
  const s = health.snapshot()
  assert.ok(s.warns.some((w) => w.includes('规模超限')), '规模超限告警')
  assert.ok(s.warns.some((w) => w.includes('复用率不足')), '复用率不足告警')
})

test('dispose：停窗（timer 清理——snapshot 仍可读）', () => {
  const { health, complete } = mk()
  complete.next()
  health.dispose()
  const s = health.snapshot()
  assert.equal(s.total.renders, 1, 'dispose 后读数为最后状态')
})

test('场景：健康页面（0 告警——正常渲染不误报）', () => {
  const { health, applied, complete, spy } = mk()
  applied.next([{ op: 'create', id: 'root.0', tag: 'div' } as Command])
  complete.next()
  spy.push({ kind: 'seg:reuse' }, { kind: 'seg:reuse' }) // 全复用
  health.refresh()
  const s = health.snapshot()
  assert.deepEqual(s.warns, [], '正常渲染零告警（阈值门控）')
})
