import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickToDispatch, tickTimeouts } from '../src/services/survey-campaign.ts'
import type { RunRow } from '../src/services/survey-campaign.ts'

/** Campaign 调度判据契约测试（S1——纯函数——node 直跑） */

function run(patch: Partial<RunRow> = {}): RunRow {
  return {
    id: 'r1', campaign_id: 'c1', agent_id: 'a1', agent_name: '问卷-互联网-经理-谨慎',
    dept_id: 'd1', status: 'queued', attempts: 0, started_at: null, finished_at: null, error: null,
    ...patch,
  }
}

test('pickToDispatch：水位补派——active=并发 → 空（不超发）', () => {
  const runs = [run({ id: 'r1', status: 'running', started_at: new Date().toISOString() }), run({ id: 'r2' }), run({ id: 'r3' })]
  assert.deepEqual(pickToDispatch(runs, 1).map((r) => r.id), [], '1 active = concurrency 1——不补')
})

test('pickToDispatch：差额补派——active < 并发 → 取 queued FIFO', () => {
  const runs = [run({ id: 'r1', status: 'running', started_at: new Date().toISOString() }), run({ id: 'r2' }), run({ id: 'r3' }), run({ id: 'r4', status: 'done' })]
  const out = pickToDispatch(runs, 3)
  assert.deepEqual(out.map((r) => r.id), ['r2', 'r3'], '差 2 槽——取前 2 个 queued（done 不占槽）')
})

test('pickToDispatch：并发 30 不超发——take 精确', () => {
  const runs = [...Array(35)].map((_, i) => run({ id: `r${i}`, status: i < 30 ? 'running' : 'queued', started_at: i < 30 ? new Date().toISOString() : null }))
  // 30 active = 并发——0 补
  assert.equal(pickToDispatch(runs, 30).length, 0)
  const runs2 = runs.slice(0, 29).map((r) => ({ ...r, status: 'running' as const }))
    .concat(runs.slice(29).map((r) => ({ ...r, status: 'queued' as const })))
  assert.equal(runs2.filter((r) => r.status === 'running').length, 29, '构造检查')
  assert.equal(pickToDispatch(runs2, 30).length, 1, '29 active → 补 1')
})

test('tickTimeouts：未超时不动（180s 边界内）', () => {
  const now = Date.now()
  const runs = [run({ id: 'r1', status: 'running', started_at: new Date(now - 120_000).toISOString() })]
  const { requeue, failed } = tickTimeouts(runs, 2, 180_000, now)
  assert.equal(requeue.length, 0)
  assert.equal(failed.length, 0)
})

test('tickTimeouts：超时 → attempts 未耗尽重派（requeue）', () => {
  const now = Date.now()
  const runs = [run({ id: 'r1', status: 'running', attempts: 1, started_at: new Date(now - 200_000).toISOString() })]
  const { requeue, failed } = tickTimeouts(runs, 2, 180_000, now)
  assert.deepEqual(requeue.map((r) => r.id), ['r1'])
  assert.equal(failed.length, 0)
})

test('tickTimeouts：超时 + attempts 耗尽 → failed（重试上限）', () => {
  const now = Date.now()
  const runs = [run({ id: 'r1', status: 'running', attempts: 2, started_at: new Date(now - 200_000).toISOString() })]
  const { requeue, failed } = tickTimeouts(runs, 2, 180_000, now)
  assert.equal(requeue.length, 0)
  assert.deepEqual(failed.map((r) => r.id), ['r1'])
})

test('tickTimeouts：queued/done 不参与超时判定（只扫 running）', () => {
  const now = Date.now()
  const runs = [
    run({ id: 'r1', status: 'queued' }),
    run({ id: 'r2', status: 'done', started_at: new Date(now - 200_000).toISOString() }),
    run({ id: 'r3', status: 'running', started_at: new Date(now - 200_000).toISOString() }),
  ]
  const { requeue, failed } = tickTimeouts(runs, 1, 180_000, now)
  assert.equal(requeue.length + failed.length, 1, '仅 running 超时参与')
  assert.equal((requeue[0] ?? failed[0])?.id, 'r3')
})

test('tickTimeouts：retry=0 → 首次超时即失败', () => {
  const now = Date.now()
  const runs = [run({ id: 'r1', status: 'running', attempts: 0, started_at: new Date(now - 200_000).toISOString() })]
  const { requeue, failed } = tickTimeouts(runs, 0, 180_000, now)
  assert.equal(requeue.length, 0)
  assert.equal(failed.length, 1)
})
