/**
 * 沙盒集成测试（T6/T7）——需要 docker 可用（CS-04 真环境精神）
 *
 * T6: Heartbeat 生命周期——创建 → touch → 超时回收 → 惰性重建 → 孤儿清理
 * T7: 池上限 LRU 驱逐——MAX=2 → 第 3 个驱逐最旧 → 重建无感
 *
 * 运行：node --env-file=.env --test test/sandbox.test.ts（docker 不可用则 skip）
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { DockerSandbox } from '../src/sandbox/docker.ts'

function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['version'], { timeout: 5000, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const HAS_DOCKER = dockerAvailable()
const A1 = 'sandbox-test-a1'
const A1B = 'sandbox-test-a1b'
const A2 = 'sandbox-test-a2'
const A3 = 'sandbox-test-a3'
const SANDBOX_NAME = (id: string) => `ap-sandbox-${id}`

function containerExists(name: string): boolean {
  try {
    const out = execFileSync('docker', ['ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}'], { timeout: 5000 })
    return out.toString().trim().length > 0
  } catch {
    return false
  }
}

async function rmContainer(name: string): Promise<void> {
  try { execFileSync('docker', ['rm', '-f', name], { timeout: 10000, stdio: 'ignore' }) } catch { /* 不存在 */ }
}

// 每个测试用独立实例（短 IDLE_TIMEOUT / 小池上限）
function makeSandbox(overrides: Partial<{ idleTimeoutMs: number; maxContainers: number }>) {
  return new DockerSandbox({
    enabled: true,
    idleTimeoutMs: overrides.idleTimeoutMs ?? 60_000,
    maxContainers: overrides.maxContainers ?? 10,
    reaperIntervalMs: 500, // 快速回收
    execTimeoutMs: 30_000,
  })
}

const testIdle = 2000 // 2s 空闲超时

// 每个测试独立实例（T7 用 MAX=2）
function newSandbox() {
  const s = makeSandbox({ idleTimeoutMs: testIdle, maxContainers: 2 })
  s.startReaper() // T6b 需要 reaper 定时器
  return s
}

before(async () => {
  if (!HAS_DOCKER) return
  await rmContainer(SANDBOX_NAME(A1))
  await rmContainer(SANDBOX_NAME(A1B))
  await rmContainer(SANDBOX_NAME(A2))
  await rmContainer(SANDBOX_NAME(A3))
})

after(async () => {
  if (!HAS_DOCKER) return
  await rmContainer(SANDBOX_NAME(A1))
  await rmContainer(SANDBOX_NAME(A1B))
  await rmContainer(SANDBOX_NAME(A2))
  await rmContainer(SANDBOX_NAME(A3))
})

test('T6a: 创建容器 + 工具执行（write/read 卷持久化）', { skip: !HAS_DOCKER }, async () => {
  const sandbox = newSandbox()
  const ws = await mkdtemp(join(tmpdir(), 'sandbox-t6-'))
  try {
    // write → 创建容器 + 卷写入
    const w = await sandbox.runTool(A1, ws, 'write', { path: 't6.txt', content: 't6-hello' })
    assert.equal(w.ok, true, JSON.stringify(w))
    assert.ok(containerExists(SANDBOX_NAME(A1)), '容器应已创建')

    // read → 同一容器读取（卷持久化）
    const r = await sandbox.runTool(A1, ws, 'read', { path: 't6.txt' })
    assert.equal(r.ok, true)
    assert.ok(String(r.output).includes('t6-hello'))
  } finally {
    await rm(ws, { recursive: true, force: true })
  }
})

test('T6b: heartbeat 超时 → 定时器销毁 → 惰性重建（卷文件保留）', { skip: !HAS_DOCKER }, async () => {
  const sandbox = newSandbox()
  const ws = await mkdtemp(join(tmpdir(), 'sandbox-t6b-'))
  try {
    await sandbox.runTool(A1B, ws, 'write', { path: 'persist.txt', content: 'survives' })
    assert.ok(containerExists(SANDBOX_NAME(A1B)), '容器存在')

    // 等待 idle timeout + reaper 周期
    await new Promise(r => setTimeout(r, testIdle + 1800))
    assert.ok(!containerExists(SANDBOX_NAME(A1B)), '空闲超时后容器应被回收')

    // 惰性重建 + 卷文件保留
    const r = await sandbox.runTool(A1B, ws, 'read', { path: 'persist.txt' })
    assert.equal(r.ok, true, JSON.stringify(r))
    assert.ok(String(r.output).includes('survives'), '卷文件应在重建后仍可读')
    assert.ok(containerExists(SANDBOX_NAME(A1B)), '重建后容器存在')
  } finally {
    await rm(ws, { recursive: true, force: true })
  }
})

test('T7: 池上限 LRU 驱逐（MAX=2）→ 第 3 个驱逐最旧 → 被驱逐者重建无感', { skip: !HAS_DOCKER }, async () => {
  const sandbox = newSandbox()
  const ws1 = await mkdtemp(join(tmpdir(), 'sandbox-t7-1-'))
  const ws2 = await mkdtemp(join(tmpdir(), 'sandbox-t7-2-'))
  const ws3 = await mkdtemp(join(tmpdir(), 'sandbox-t7-3-'))
  try {
    // A1 先使用（最旧）
    await sandbox.runTool(A1, ws1, 'write', { path: 'a1.txt', content: 'one' })
    assert.ok(containerExists(SANDBOX_NAME(A1)))
    await new Promise(r => setTimeout(r, 100))

    // A2（较新）
    await sandbox.runTool(A2, ws2, 'write', { path: 'a2.txt', content: 'two' })
    assert.ok(containerExists(SANDBOX_NAME(A2)))

    // A3 创建 → 池满（2）→ 驱逐 LRU 最旧的 A1
    await sandbox.runTool(A3, ws3, 'write', { path: 'a3.txt', content: 'three' })
    assert.ok(containerExists(SANDBOX_NAME(A3)), 'A3 容器应创建')
    assert.ok(!containerExists(SANDBOX_NAME(A1)), '最旧的 A1 应被驱逐')

    // A1 再次调用 → 惰性重建（卷文件保留）
    const r1 = await sandbox.runTool(A1, ws1, 'read', { path: 'a1.txt' })
    assert.equal(r1.ok, true, JSON.stringify(r1))
    assert.ok(String(r1.output).includes('one'), 'A1 重建后卷文件保留')
    assert.ok(containerExists(SANDBOX_NAME(A1)), 'A1 重建')

    // 池大小恒 ≤ 2
    const out = execFileSync('docker', ['ps', '--filter', 'name=ap-sandbox-sandbox-test', '--format', '{{.Names}}'], { timeout: 5000 })
    const names = out.toString().trim().split('\n').filter(Boolean)
    assert.ok(names.length <= 2, `池大小应 ≤ 2，实际 ${names.length}`)
  } finally {
    await rm(ws1, { recursive: true, force: true })
    await rm(ws2, { recursive: true, force: true })
    await rm(ws3, { recursive: true, force: true })
  }
})

test('T6c: 孤儿清理——扫描 ap-sandbox-* 全删', { skip: !HAS_DOCKER }, async () => {
  const sandbox = newSandbox()
  const ws = await mkdtemp(join(tmpdir(), 'sandbox-t6c-'))
  try {
    await sandbox.runTool(A1, ws, 'write', { path: 'x.txt', content: 'x' })
    assert.ok(containerExists(SANDBOX_NAME(A1)))
    const cleaned = await sandbox.cleanupOrphans()
    assert.ok(cleaned >= 1, `应清理至少 1 个孤儿，实际 ${cleaned}`)
    assert.ok(!containerExists(SANDBOX_NAME(A1)), '孤儿清理后容器删除')
  } finally {
    await rm(ws, { recursive: true, force: true })
  }
})
