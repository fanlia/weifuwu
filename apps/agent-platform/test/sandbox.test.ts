/**
 * 沙盒生命周期集成测试（T-M1 + T-M2）——需要 docker + postgres 可用（CS-04 真环境）
 *
 * M1 执行器（纯执行层）：
 *   T-M1a 并发 ensure 去重（P0-2）——10 并发同部门 → 1 容器全成功
 *   T-M1b busy 豁免（P0-1）——exec 期间 reconcile 不回收
 *   T-M1c 容器内超时（P0-3）——超时杀进程树，无孤儿
 *   T-M1d stopped 自愈（P1-5）——stop 后自动 start
 *   T-M1e 漂移重建（P1-6）——network 变更 → 重建
 * M2 管理器（状态机/回收）：
 *   T-M2a 状态机全路径——requested→running→stopped→running→terminated
 *   T-M2b 孤儿清理——docker 有 DB 无 → rm
 *   T-M2c per-sandbox 串行队列——并发 exec 排队
 *
 * 运行：node --env-file=.env --test test/sandbox.test.ts（docker/postgres 不可用则 skip）
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { postgres } from 'weifuwu'
import { DockerSandbox } from '../src/sandbox/docker.ts'
import { SandboxManager } from '../src/sandbox/manager.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['version'], { timeout: 5000, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const HAS_DOCKER = process.env.RUN_DOCKER_TESTS === '1' && dockerAvailable()
// S7（2026-08）：skip 可观测——docker 不可用/未启用时 warn 原因（不静默）
if (process.env.RUN_DOCKER_TESTS !== '1') {
  console.log('[sandbox-test] 跳过（RUN_DOCKER_TESTS 未设——docker 集成专项——npm run test:docker）')
} else if (!dockerAvailable()) {
  console.warn('[sandbox-test] docker 不可用——11 测试 skip（环境缺 docker）')
}
const TEST_APP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const TEST_DEPT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const CONTAINER_NAME = (id: string) => `ap-sandbox-${id}`

function containerExists(name: string): boolean {
  try {
    const out = execFileSync('docker', ['ps', '-a', '--filter', `name=^${name}$`, '--format', '{{.Names}}'], { timeout: 5000 })
    return out.toString().trim().length > 0
  } catch {
    return false
  }
}

function containerRunning(name: string): boolean {
  try {
    const out = execFileSync('docker', ['ps', '--filter', `name=^${name}$`, '--format', '{{.Names}}'], { timeout: 5000 })
    return out.toString().trim().length > 0
  } catch {
    return false
  }
}

async function rmContainer(name: string): Promise<void> {
  try { execFileSync('docker', ['rm', '-f', name], { timeout: 10000, stdio: 'ignore' }) } catch { /* 不存在 */ }
}

function inspect(name: string, format: string): string {
  try {
    return execFileSync('docker', ['inspect', name, '--format', format], { timeout: 5000 }).toString().trim()
  } catch {
    return ''
  }
}

let sql: any
let wsDir: string

// 测试用短超时配置（独立实例）
function makeSandbox(overrides: Partial<{ execTimeoutMs: number }> = {}) {
  return new DockerSandbox({
    enabled: true,
    execTimeoutMs: overrides.execTimeoutMs ?? 30_000,
    runnerPath: join(__dirname, '../src/sandbox/tool-runner.js'),
  })
}

function makeManager(exe: DockerSandbox, overrides: Partial<{ idleTimeoutMs: number; stopTimeoutMs: number; maxLifetimeMs: number; reconcileIntervalMs: number; poolBudgetMb: number }> = {}) {
  const m = new SandboxManager(exe, {
    idleTimeoutMs: overrides.idleTimeoutMs ?? 60_000,
    stopTimeoutMs: overrides.stopTimeoutMs ?? 120_000,
    maxLifetimeMs: overrides.maxLifetimeMs ?? 0, // 默认禁用超龄（测试显式开启）
    reconcileIntervalMs: overrides.reconcileIntervalMs ?? 300,
    poolBudgetMb: overrides.poolBudgetMb ?? 0, // 默认禁用预算（测试显式开启）
  })
  m.init(sql)
  return m
}

async function cleanTestData(): Promise<void> {
  await sql`DELETE FROM sandboxes WHERE app_id = ${TEST_APP}`.catch(() => {})
  // 清理测试容器
  const out = execFileSync('docker', ['ps', '-a', '--filter', 'name=ap-sandbox-sandbox-test', '--format', '{{.Names}}'], { timeout: 5000 }).toString()
  for (const n of out.trim().split('\n').filter(Boolean)) {
    await rmContainer(n)
  }
}

before(async () => {
  if (!HAS_DOCKER) return
  const pg = postgres({ url: process.env.DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo', max: 3 })
  sql = (pg as any).sql
  // 建表（幂等——与 schema.sql 对齐；manager 依赖的最小结构）
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS sandboxes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL,
    department_id UUID,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested',
    mode TEXT NOT NULL DEFAULT 'persistent',
    image TEXT NOT NULL DEFAULT 'ap-sandbox:latest',
    network BOOLEAN NOT NULL DEFAULT FALSE,
    memory_mb INT NOT NULL DEFAULT 512,
    cpus INT NOT NULL DEFAULT 1,
    error TEXT,
    workspace TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    terminated_at TIMESTAMPTZ
  )`)
  await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_sandboxes_dept_active ON sandboxes(department_id) WHERE department_id IS NOT NULL AND status != 'terminated'`)
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_id UUID NOT NULL,
    name TEXT NOT NULL,
    is_dm BOOLEAN NOT NULL DEFAULT FALSE,
    workspace_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  // 配额查询依赖（框架表——ALTER 加列幂等 + 补必填列插入；owner 用现存用户满足外键）
  await sql.unsafe(`ALTER TABLE _weifuwu_apps ADD COLUMN IF NOT EXISTS sandbox_quota INT NOT NULL DEFAULT 5`)
  const [anyUser] = await sql`SELECT id FROM _weifuwu_users LIMIT 1`
  const ownerId = anyUser?.id ?? '00000000-0000-0000-0000-000000000000'
  await sql.unsafe(`INSERT INTO _weifuwu_apps (id, slug, name, owner_user_id, sandbox_quota)
    VALUES ('${TEST_APP}', 'sandbox-test', '沙盒测试租户', '${ownerId}', 10)
    ON CONFLICT (id) DO UPDATE SET sandbox_quota = 10`)
  await sql.unsafe(`INSERT INTO departments (id, app_id, name, is_dm) VALUES ('${TEST_DEPT}', '${TEST_APP}', '沙盒测试部门', FALSE) ON CONFLICT (id) DO NOTHING`)
  wsDir = await mkdtemp(join(tmpdir(), 'sandbox-it-'))
  await cleanTestData()
  // S1（2026-08）：镜像预检查（幂等——缺失才拉——测试内 ensure 不再重复
  // probe/pull——冷环境首次拉镜像不阻塞单测试——fail fast 明确）
  // **注意**：execFileSync 失败=抛错（非返回空）——用超时包一层判断存在性
  const imgOk = (() => {
    try {
      execFileSync('docker', ['image', 'inspect', 'ap-sandbox:latest', '--format', '{{.Id}}'], { timeout: 10_000, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()
  if (!imgOk) {
    execFileSync('docker', ['pull', 'ap-sandbox:latest'], { timeout: 180_000, stdio: 'ignore' })
    console.log('[sandbox-test] 已拉取 ap-sandbox:latest（首次——后续测试复用）')
  }
})

after(async () => {
  if (!HAS_DOCKER) return
  await cleanTestData()
  await rm(wsDir, { recursive: true, force: true })
  await sql?.close?.()
})

test('T-M1a: 并发 ensure 去重——10 并发同部门 → 1 容器全成功（P0-2）', { skip: !HAS_DOCKER, timeout: 20_000 }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe)
  const results = await Promise.all(
    Array.from({ length: 10 }, () => m.runTool(TEST_DEPT, wsDir, 'write', { path: 'a.txt', content: 'x' })),
  )
  for (const r of results) assert.equal(r.ok, true, JSON.stringify(r))
  // 记录唯一 + 容器唯一
  const rows = await sql`SELECT * FROM sandboxes WHERE department_id = ${TEST_DEPT} AND status != 'terminated'`
  assert.equal(rows.length, 1, `应只有 1 条记录，实际 ${rows.length}`)
  const id = String(rows[0].id)
  const names = execFileSync('docker', ['ps', '-a', '--filter', `name=^${CONTAINER_NAME(id)}$`, '--format', '{{.Names}}'], { timeout: 5000 }).toString().trim()
  assert.ok(names.includes(id), `容器应唯一（${names}）`)
  await m.terminate(id, TEST_APP)
})

test('T-M1b: busy 豁免——exec 期间 reconcile 不回收（P0-1）', { skip: !HAS_DOCKER, timeout: 20_000 }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe, { idleTimeoutMs: 800 })
  // 容器内 sleep 2.5s（超过 idle 800ms）——exec 期间 reconcile 多轮扫描
  const p = m.runTool(TEST_DEPT, wsDir, 'bash', { command: 'sleep 2.5 && echo done' })
  // exec 进行中触发多轮 reconcile（busy 豁免必须跳过）
  const t0 = Date.now()
  while (Date.now() - t0 < 1500) {
    await m.reconcile()
    await new Promise(r => setTimeout(r, 200))
  }
  const r = await p
  assert.equal(r.ok, true, `exec 应完整返回不被回收: ${JSON.stringify(r)}`)
  const [row] = await sql`SELECT * FROM sandboxes WHERE department_id = ${TEST_DEPT} AND status != 'terminated'`
  assert.ok(row, '记录应存在')
  const id = String(row.id)
  assert.ok(containerExists(CONTAINER_NAME(id)), 'exec 期间容器不应被删除')
  // exec 完成后 idle 超时 → reconcile 回收（stop）
  await new Promise(r => setTimeout(r, 1200))
  await m.reconcile()
  const [row2] = await sql`SELECT * FROM sandboxes WHERE id = ${id}`
  assert.equal(String(row2.status), 'stopped', '空闲后应自动 stop')
  assert.ok(containerExists(CONTAINER_NAME(id)), 'stop 后容器保留（瞬态）')
  assert.ok(!containerRunning(CONTAINER_NAME(id)), '容器应已停止')
  await m.terminate(id, TEST_APP)
})

test('T-M1c: 容器内超时杀进程树——无孤儿进程（P0-3）', { skip: !HAS_DOCKER }, async () => {
  await cleanTestData()
  const exe = makeSandbox({ execTimeoutMs: 3000 })
  const m = makeManager(exe)
  const r = await m.runTool(TEST_DEPT, wsDir, 'bash', { command: 'sleep 60' })
  assert.equal(r.ok, false)
  assert.ok(r.timedOut || String(r.error).includes('超时'), `应报超时: ${JSON.stringify(r)}`)
  const [row] = await sql`SELECT * FROM sandboxes WHERE department_id = ${TEST_DEPT} AND status != 'terminated'`
  const id = String(row.id)
  // 容器内无残留进程（sleep 60 应被 timeout -s KILL 杀掉）
  const top = execFileSync('docker', ['top', CONTAINER_NAME(id)], { timeout: 5000 }).toString()
  assert.ok(!top.includes('sleep 60'), `容器内不应有残留 sleep 进程: ${top}`)
  await m.terminate(id, TEST_APP)
})

test('T-M1d: stopped 自愈——docker stop 后 runTool 自动 start（P1-5）', { skip: !HAS_DOCKER, timeout: 20_000 }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe)
  const r1 = await m.runTool(TEST_DEPT, wsDir, 'write', { path: 'b.txt', content: 'keep' })
  assert.equal(r1.ok, true)
  const [row] = await sql`SELECT * FROM sandboxes WHERE department_id = ${TEST_DEPT} AND status != 'terminated'`
  const id = String(row.id)
  // 外部 stop（模拟管理员/故障）——**带 -t 2**（对齐生产 containerAction——
  // entrypoint 不转发 SIGTERM——10s 默认宽限会超——2s 实测 2.1s）
  execFileSync('docker', ['stop', '-t', '2', CONTAINER_NAME(id)], { timeout: 8000 })
  assert.ok(!containerRunning(CONTAINER_NAME(id)))
  // 再次工具调用 → 自动 start 自愈 + 卷文件保留
  const r2 = await m.runTool(TEST_DEPT, wsDir, 'read', { path: 'b.txt' })
  assert.equal(r2.ok, true, JSON.stringify(r2))
  assert.ok(String(r2.output).includes('keep'), '卷文件应在 start 后仍可读')
  assert.ok(containerRunning(CONTAINER_NAME(id)), '容器应已自动启动')
  await m.terminate(id, TEST_APP)
})

test('T-M1e: 漂移重建——network 变更 → 容器重建（P1-6）', { skip: !HAS_DOCKER }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe)
  // 第一次显式无网络（默认已改 true——制造漂移场景：network false → true）
  const r1 = await m.runTool(TEST_DEPT, wsDir, 'write', { path: 'c.txt', content: 'net' }, { network: false })
  assert.equal(r1.ok, true)
  const [row] = await sql`SELECT * FROM sandboxes WHERE department_id = ${TEST_DEPT} AND status != 'terminated'`
  const id = String(row.id)
  const created1 = inspect(CONTAINER_NAME(id), '{{.Created}}')
  // 带网络再次调用 → ensure 检测漂移 → 重建
  const r2 = await m.runTool(TEST_DEPT, wsDir, 'read', { path: 'c.txt' }, { network: true })
  assert.equal(r2.ok, true, JSON.stringify(r2))
  const netMode = inspect(CONTAINER_NAME(id), '{{.HostConfig.NetworkMode}}')
  assert.equal(netMode, 'bridge', `网络模式应为 bridge（漂移重建），实际 ${netMode}`)
  const created2 = inspect(CONTAINER_NAME(id), '{{.Created}}')
  assert.notEqual(created1, created2, '容器应被重建')
  // 卷文件保留
  assert.ok(String(r2.output).includes('net'))
  await m.terminate(id, TEST_APP)
})

test('T-M2a: 状态机全路径——requested→running→stopped→running→terminated', { skip: !HAS_DOCKER, timeout: 20_000 }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe, { idleTimeoutMs: 600, stopTimeoutMs: 2000 })
  // create → requested（惰性——容器未起）
  const row = await m.create({ appId: TEST_APP, departmentId: TEST_DEPT, name: '测试环境', workspace: wsDir })
  assert.equal(row.status, 'requested')
  assert.ok(!containerExists(CONTAINER_NAME(row.id)), 'requested 不创建容器')
  // start → running（容器在跑）
  const s = await m.start(row.id, TEST_APP)
  assert.equal(s.ok, true)
  assert.ok(containerRunning(CONTAINER_NAME(row.id)))
  let [r1] = await sql`SELECT * FROM sandboxes WHERE id = ${row.id}`
  assert.equal(String(r1.status), 'running')
  // idle 超时 → stopped（两级回收第一级）
  await new Promise(r => setTimeout(r, 900))
  await m.reconcile()
  ;[r1] = await sql`SELECT * FROM sandboxes WHERE id = ${row.id}`
  assert.equal(String(r1.status), 'stopped')
  assert.ok(!containerRunning(CONTAINER_NAME(row.id)), '容器已停止')
  // 工具调用 → 自动 start（恢复运行）
  const rr = await m.runTool(TEST_DEPT, wsDir, 'write', { path: 'd.txt', content: 'state' })
  assert.equal(rr.ok, true, JSON.stringify(rr))
  assert.ok(containerRunning(CONTAINER_NAME(row.id)), '调用后容器恢复运行')
  ;[r1] = await sql`SELECT * FROM sandboxes WHERE id = ${row.id}`
  assert.equal(String(r1.status), 'running', 'exec 成功后状态应为 running')
  // 手动 terminate → 容器删除 + 记录 terminated
  await m.terminate(row.id, TEST_APP)
  assert.ok(!containerExists(CONTAINER_NAME(row.id)), 'terminate 后容器删除')
  ;[r1] = await sql`SELECT * FROM sandboxes WHERE id = ${row.id}`
  assert.equal(String(r1.status), 'terminated')
  assert.ok(r1.terminated_at, 'terminated_at 应记录')
})

test('T-M2b: 孤儿清理——docker 有容器 DB 无记录 → rm', { skip: !HAS_DOCKER }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe)
  // 手动创建孤儿容器（无 DB 记录）
  const orphanName = 'ap-sandbox-sandbox-test-orphan'
  await rmContainer(orphanName)
  execFileSync('docker', ['run', '-d', '--name', orphanName, '--network', 'none', 'ap-sandbox:latest', 'sleep', 'infinity'], { timeout: 30000, stdio: 'ignore' })
  assert.ok(containerExists(orphanName))
  const s = await m.reconcile()
  assert.ok(s.orphans >= 1, `应清理孤儿容器，实际 ${s.orphans}`)
  assert.ok(!containerExists(orphanName), '孤儿容器应被删除')
})

test('T-M2c: per-sandbox 串行队列——并发 exec 排队执行', { skip: !HAS_DOCKER, timeout: 20_000 }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe)
  // 5 个并发 bash（各 sleep 1s）——串行队列下总时长 ≥ 4s
  const t0 = Date.now()
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) => m.runTool(TEST_DEPT, wsDir, 'bash', { command: `sleep 1 && echo done-${i}` })),
  )
  const elapsed = Date.now() - t0
  for (const r of results) assert.equal(r.ok, true, JSON.stringify(r))
  assert.ok(elapsed >= 4000, `并发 exec 应串行（≥4s），实际 ${elapsed}ms`)
  const [row] = await sql`SELECT * FROM sandboxes WHERE department_id = ${TEST_DEPT} AND status != 'terminated'`
  if (row) await m.terminate(String(row.id), TEST_APP)
})

test('T-M2d: per-app 配额——超限创建抛明确错误（409 语义）', { skip: !HAS_DOCKER }, async () => {
  await cleanTestData()
  // 配额 1 的独立 app
  const quotaApp = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
  await sql.unsafe(`INSERT INTO _weifuwu_apps (id, slug, name, owner_user_id, sandbox_quota)
    VALUES ('${quotaApp}', 'sandbox-quota-test', '配额测试租户', (SELECT id FROM _weifuwu_users LIMIT 1), 1)
    ON CONFLICT (id) DO UPDATE SET sandbox_quota = 1`)
  const exe = makeSandbox()
  const m = makeManager(exe)
  const row = await m.create({ appId: quotaApp, name: '唯一沙盒', workspace: wsDir })
  assert.equal(row.status, 'requested')
  // 第 2 个 → 配额已满
  await assert.rejects(
    () => m.create({ appId: quotaApp, name: '超限沙盒', workspace: wsDir }),
    /配额已满/,
  )
  // terminated 后不占配额 → 可再建
  await m.terminate(row.id, quotaApp)
  const row2 = await m.create({ appId: quotaApp, name: '重建沙盒', workspace: wsDir })
  assert.ok(row2.id)
  await m.terminate(row2.id, quotaApp)
  await sql`DELETE FROM sandboxes WHERE app_id = ${quotaApp}`
})

test('T-M5-2: 池内存预算——超预算驱逐非 busy 最旧 → 仍超抛明确错误', { skip: !HAS_DOCKER }, async () => {
  await cleanTestData()
  // 独立 app（quota 5）
  const budgetApp = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  await sql.unsafe(`INSERT INTO _weifuwu_apps (id, slug, name, owner_user_id, sandbox_quota)
    VALUES ('${budgetApp}', 'sandbox-budget-test', '预算测试租户', (SELECT id FROM _weifuwu_users LIMIT 1), 5)
    ON CONFLICT (id) DO UPDATE SET sandbox_quota = 5`)
  await sql`DELETE FROM sandboxes WHERE app_id = ${budgetApp}`
  const exe = makeSandbox()
  // 预算 = 1024MB（2×512——显式 memoryMb 与 DEFAULT_MEMORY_MB 解耦——默认曾 512→1024 测试漂移）——第 3 个需驱逐最旧
  const m = makeManager(exe, { poolBudgetMb: 1024 })
  const r1 = await m.create({ appId: budgetApp, name: '沙盒A', workspace: wsDir, memoryMb: 512 })
  await m.start(r1.id, budgetApp)
  await new Promise(r => setTimeout(r, 50))
  const r2 = await m.create({ appId: budgetApp, name: '沙盒B', workspace: wsDir, memoryMb: 512 })
  await m.start(r2.id, budgetApp)
  // 第 3 个 → 预算超 → 驱逐非 busy 最旧（A——last_used_at 最早）
  const r3 = await m.create({ appId: budgetApp, name: '沙盒C', workspace: wsDir, memoryMb: 512 })
  assert.ok(r3.id, '预算内应创建成功')
  const [a1] = await sql`SELECT status FROM sandboxes WHERE id = ${r1.id}`
  assert.equal(String(a1.status), 'terminated', '最旧的 A 应被驱逐')
  const [a2] = await sql`SELECT status FROM sandboxes WHERE id = ${r2.id}`
  assert.equal(String(a2.status), 'running', '较新的 B 保留')
  // 第 4 个 → 驱逐最旧非 busy（B——A 已 terminated）→ 创建成功
  const r4 = await m.create({ appId: budgetApp, name: '沙盒D', workspace: wsDir, memoryMb: 512 })
  assert.ok(r4.id, '驱逐后应创建成功')
  // 预算 1MB → 无记录可驱逐 → 明确错误
  const m2 = makeManager(exe, { poolBudgetMb: 1 })
  await assert.rejects(
    () => m2.create({ appId: budgetApp, name: '超预算', workspace: wsDir, memoryMb: 512 }),
    /内存不足/,
  )
  await sql`DELETE FROM sandboxes WHERE app_id = ${budgetApp}`
})

test('T-M6-3: ephemeral——每次调用一次性容器（调用即焚 + 卷持久）', { skip: !HAS_DOCKER }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe)
  // 创建 ephemeral 记录（不占常驻容器）
  const row = await m.create({ appId: TEST_APP, departmentId: TEST_DEPT, name: '一次性环境', workspace: wsDir, mode: 'ephemeral' })
  assert.equal(row.mode, 'ephemeral')
  // 写文件（一次性容器）
  const w = await m.runTool(TEST_DEPT, wsDir, 'write', { path: 'e.txt', content: 'ephemeral-ok' })
  assert.equal(w.ok, true, JSON.stringify(w))
  // 读文件（新的一次性容器——卷持久）
  const r = await m.runTool(TEST_DEPT, wsDir, 'read', { path: 'e.txt' })
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.ok(String(r.output).includes('ephemeral-ok'), '卷文件应在跨容器后仍可读')
  // 无常驻容器残留（ap-sandbox-e-* 是临时名——全部应已清理）
  const out = execFileSync('docker', ['ps', '-a', '--filter', 'name=ap-sandbox-e-', '--format', '{{.Names}}'], { timeout: 5000 }).toString()
  assert.equal(out.trim(), '', `ephemeral 容器应调用即焚，残留: ${out.trim()}`)
  // 记录状态：ephemeral 每次调用即焚——runTool 成功标记 running（最近执行过）
  const [row2] = await sql`SELECT * FROM sandboxes WHERE id = ${row.id}`
  assert.equal(String(row2.status), 'running', 'ephemeral 调用成功后标记运行')
  await m.terminate(row.id, TEST_APP)
})

// ── SANDBOX-AGENT-PLAN Wave 4 契约（2026-08——entrypoint  agent 化）──────

test('T-M1f: sandbox-agent 信号处理——docker stop 秒级（PID1 显式 handler——曾 10s 宽限后 SIGKILL）', { skip: !HAS_DOCKER, timeout: 20_000 }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe)
  const r1 = await m.runTool(TEST_DEPT, wsDir, 'write', { path: 'agent.txt', content: 'agent-ok' })
  assert.equal(r1.ok, true)
  const [row] = await sql`SELECT * FROM sandboxes WHERE department_id = ${TEST_DEPT} AND status != 'terminated'`
  const id = String(row.id)
  // docker stop 计时——agent 化后应 <2s（曾 10.1s）
  const t0 = Date.now()
  execFileSync('docker', ['stop', '-t', '10', CONTAINER_NAME(id)], { timeout: 12_000 })
  const stopMs = Date.now() - t0
  assert.ok(stopMs < 2000, `stop 应秒级（agent PID1 信号处理）——实测 ${stopMs}ms`)
  assert.ok(!containerRunning(CONTAINER_NAME(id)), '容器已停')
  await m.terminate(id, TEST_APP)
})

test('T-M1g: sandbox-agent 健康/能力面——/healthz 200 + /capabilities 声明（镜像自描述）', { skip: !HAS_DOCKER, timeout: 20_000 }, async () => {
  await cleanTestData()
  const exe = makeSandbox()
  const m = makeManager(exe)
  const r1 = await m.runTool(TEST_DEPT, wsDir, 'write', { path: 'agent.txt', content: 'agent-ok' })
  assert.equal(r1.ok, true)
  const [row] = await sql`SELECT * FROM sandboxes WHERE department_id = ${TEST_DEPT} AND status != 'terminated'`
  const id = String(row.id)
  // 容器内 healthz（agent 监听 127.0.0.1:5711）
  const hz = execFileSync('docker', ['exec', CONTAINER_NAME(id), 'wget', '-qO-', 'http://127.0.0.1:5711/healthz'], { timeout: 5000 }).toString()
  const parsed = JSON.parse(hz)
  assert.equal(parsed.ok, true, 'healthz 应 200 ok')
  assert.equal(parsed.pid, 1, 'PID1 = agent（信号处理面）')
  // capabilities（镜像能力声明）
  const caps = execFileSync('docker', ['exec', CONTAINER_NAME(id), 'wget', '-qO-', 'http://127.0.0.1:5711/capabilities'], { timeout: 5000 }).toString()
  const c = JSON.parse(caps)
  assert.ok(Array.isArray(c.tools) && c.tools.includes('bash'), 'capabilities 含工具声明')
  await m.terminate(id, TEST_APP)
})
