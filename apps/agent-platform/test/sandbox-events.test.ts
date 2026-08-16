/**
 * sandbox 事件流测试——事件发射/环形缓冲/查询/重置
 * （纯逻辑测试——不依赖 docker——事件是沙盒层的可观测契约）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sandboxEmit, sandboxEvents, resetSandboxEvents } from '../src/sandbox/events.ts'

test('sandbox 事件流：发射 + 查询（按 sandboxId/action 过滤）', () => {
  resetSandboxEvents()
  sandboxEmit('create', 'sb-1', { name: '部门A', memoryMb: 1024 })
  sandboxEmit('exec:start', 'sb-1', { tool: 'bash' })
  sandboxEmit('exec:end', 'sb-1', { tool: 'bash', ms: 12 })
  sandboxEmit('status', 'sb-2', { status: 'running' })

  const all = sandboxEvents()
  assert.equal(all.length, 4, '全部事件')
  assert.equal(all[0].action, 'create', '时间序（create 最先）')
  assert.equal(all[0].entity, 'sandbox', 'entity 统一')
  assert.equal(all[0].payload?.memoryMb, 1024, 'payload 完整')

  const bySandbox = sandboxEvents(100, { sandboxId: 'sb-1' })
  assert.equal(bySandbox.length, 3, '按 sandboxId 过滤')

  const byAction = sandboxEvents(100, { action: 'exec:end' })
  assert.equal(byAction.length, 1, '按 action 过滤')
  assert.equal(byAction[0].payload?.ms, 12, 'exec 耗时可查')
})

test('sandbox 事件流：环形缓冲溢出（最旧覆盖——与前端 stream 同构）', () => {
  resetSandboxEvents()
  // 发射超过容量（5000）——验证溢出覆盖（最旧丢失——不崩溃）
  for (let i = 0; i < 5050; i++) sandboxEmit('exec:end', `sb-${i % 10}`, { i })
  const all = sandboxEvents(6000) // 取全部（默认 n=100——最近 100）
  assert.equal(all.length, 5000, '环形容量 5000')
  // 最新的事件在（不丢新的）
  assert.equal(all[all.length - 1].payload?.i, 5049, '最新保留')
})

test('sandbox 事件流：reconcile 漂移/生命周期事件命名完整（drift/idle-stop 可审计）', () => {
  resetSandboxEvents()
  // 模拟 reconcile 的发射点（漂移检测——绕过点/自愈/回收）
  sandboxEmit('reconcile:drift', 'sb-9', { reason: 'orphan', detail: '容器存在但 DB 无记录', action: 'rm' })
  sandboxEmit('reconcile:drift', 'sb-9', { reason: 'container-stopped', detail: '期望 running 但容器已停止', action: 'restart' })
  sandboxEmit('reconcile:idle-stop', 'sb-9', { idleMs: 600_000 })
  const drifts = sandboxEvents(100, { action: 'reconcile:drift' })
  assert.equal(drifts.length, 2, '漂移事件成对（检测 + 修复可审计）')
  assert.equal(drifts[0].payload?.reason, 'orphan', '孤儿漂移（绕过点）')
  assert.equal(drifts[1].payload?.action, 'restart', '自愈动作')
  const idle = sandboxEvents(100, { action: 'reconcile:idle-stop' })
  assert.equal(idle[0].payload?.idleMs, 600_000, 'idle 回收时长可审计')
})

test('sandbox 事件流：调度事件（预算驱逐 LRU + 超限拒绝——可审计）', () => {
  resetSandboxEvents()
  sandboxEmit('evict', 'sb-7', { reason: 'pool-budget', detail: 'LRU 驱逐（预算 4096MB——释放 1024MB）' })
  sandboxEmit('queue:rejected', undefined, { reason: 'pool-budget', detail: '预算 4096MB——需要 2048MB' })
  const evicts = sandboxEvents(100, { action: 'evict' })
  assert.equal(evicts.length, 1, '驱逐事件')
  assert.equal(evicts[0].payload?.reason, 'pool-budget', '驱逐原因（LRU/预算）')
  const rejected = sandboxEvents(100, { action: 'queue:rejected' })
  assert.equal(rejected.length, 1, '超限拒绝事件（不静默降级）')
})
