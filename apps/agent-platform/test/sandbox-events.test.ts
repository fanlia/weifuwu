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
