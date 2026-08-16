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

test('sandbox 事件流：持久化订阅机制（emit 同步回调——退订生效）', () => {
  resetSandboxEvents()
  const received: string[] = []
  const unsub = subscribeSandboxEvents((e) => received.push(e.action))
  sandboxEmit('exec:end', 'sb-1', { ms: 10 })
  sandboxEmit('reconcile:drift', 'sb-1', { reason: 'orphan' })
  sandboxEmit('evict', 'sb-1', { reason: 'pool-budget' })
  unsub()
  sandboxEmit('status', 'sb-1', { status: 'running' }) // 退订后不收
  assert.deepEqual(received, ['exec:end', 'reconcile:drift', 'evict'], '订阅收到（emit 同步）——退订后停止')
})

import { subscribeSandboxEvents } from '../src/sandbox/events.ts'

test('阶段 1：统一 schema——错误码 code（与 ai error 对齐）', () => {
  resetSandboxEvents()
  sandboxEmit('exec:error', 'sb-1', { departmentId: 'd1', tool: 'bash', code: 'exec_error' })
  sandboxEmit('exec:timeout', 'sb-1', { departmentId: 'd1', tool: 'agent-browser', code: 'timeout' })
  const errors = sandboxEvents(100, { action: 'exec:error' })
  assert.equal(errors[0].payload?.code, 'exec_error', 'exec:error 带 code')
  const timeouts = sandboxEvents(100, { action: 'exec:timeout' })
  assert.equal(timeouts[0].payload?.code, 'timeout', 'exec:timeout 带 code')
})

test('阶段 1：宿主抽象——hostId 标注（集群化——跨宿主聚合基础）', () => {
  resetSandboxEvents()
  sandboxEmit('exec:start', 'sb-1', { departmentId: 'd1', tool: 'bash', hostId: 'local' })
  sandboxEmit('create', 'sb-1', { hostId: 'local' })
  sandboxEmit('host:register', undefined, { hostId: 'local', memoryMb: 4096, cpus: 1 })
  const execs = sandboxEvents(100, { action: 'exec:start' })
  assert.equal(execs[0].payload?.hostId, 'local', 'exec 事件带 hostId')
  const regs = sandboxEvents(100, { action: 'host:register' })
  assert.equal(regs[0].payload?.hostId, 'local', '宿主注册事件（容量视图）')
})

test('阶段 2：集群聚合——远程宿主事件上报 → 统一查询（host 过滤）', () => {
  resetSandboxEvents()
  // 本地事件（hostId: local）
  sandboxEmit('exec:start', 'sb-1', { departmentId: 'd1', tool: 'bash', hostId: 'local' })
  // 远程宿主事件（hostEventIngest——模拟 ws 上报）
  hostEventIngest({ entity: 'sandbox', action: 'exec:start', target: 'sb-9', payload: { departmentId: 'd2', tool: 'read', hostId: 'host-2' }, ts: Date.now() })
  // 跨宿主统一查询（host 过滤）
  const all = clusterEvents(100)
  assert.ok(all.length >= 2, `跨宿主聚合——实际 ${all.length}`)
  const host2 = clusterEvents(100, { hostId: 'host-2' })
  assert.equal(host2.length, 1, '按 host 过滤（host-2）')
  assert.equal(host2[0].payload?.tool, 'read', '远程宿主事件可查')
  const local = clusterEvents(100, { hostId: 'local' })
  assert.ok(local.length >= 1, '本地宿主事件（hostId: local）')
})

import { hostEventIngest, clusterEvents } from '../src/sandbox/events.ts'
