/**
 * 三层模型 M0 测试——部门级工作空间解析（resolveDepartmentWorkspace）
 *
 * 升华语义（2026-12 用户决策）：
 *   - 部门 = 工作目录（归属从 agent 移到部门）
 *   - 单聊（is_dm）/无部门上下文 → 无工作空间（null）
 *   - 自定义 departments.workspace_path 优先；默认 {AGENT_WORKSPACE_ROOT}/{department_id}/
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let wsRoot: string
let mod: typeof import('../src/middleware/workspace.ts')

before(async () => {
  wsRoot = await mkdtemp(join(tmpdir(), 'ws-dept-'))
  process.env.AGENT_WORKSPACE_ROOT = wsRoot
  mod = await import('../src/middleware/workspace.ts')
})

after(async () => {
  delete process.env.AGENT_WORKSPACE_ROOT
  await rm(wsRoot, { recursive: true, force: true })
})

test('M0a: 默认路径 = {root}/{department_id}/（自动创建）', async () => {
  const ws = await mod.resolveDepartmentWorkspace('dept-1', null, true)
  assert.equal(ws, join(wsRoot, 'dept-1'))
  await access(ws) // 目录已自动创建
})

test('M0b: 自定义 workspace_path 优先', async () => {
  const custom = await mkdtemp(join(tmpdir(), 'ws-custom-'))
  const ws = await mod.resolveDepartmentWorkspace('dept-2', custom, true)
  assert.equal(ws, custom)
  await rm(custom, { recursive: true, force: true })
})

test('M0c: allowFileTools=false → null', async () => {
  assert.equal(await mod.resolveDepartmentWorkspace('dept-3', null, false), null)
})

test('M0d: 无部门上下文（preview departmentId 空）→ null；单聊也是部门特例——同样有目录', async () => {
  assert.equal(await mod.resolveDepartmentWorkspace('', null, true), null)
  // 单聊（is_dm=true）id 同样解析出目录（部门特例语义——解析不区分单聊/群聊）
  const dm = await mod.resolveDepartmentWorkspace('dm-1', null, true)
  assert.equal(dm, join(wsRoot, 'dm-1'))
})

test('M0e: 同一部门多次解析返回同一路径（幂等——成员共享目录）', async () => {
  const a = await mod.resolveDepartmentWorkspace('dept-shared', null, true)
  const b = await mod.resolveDepartmentWorkspace('dept-shared', null, true)
  assert.equal(a, b)
  assert.equal(a, join(wsRoot, 'dept-shared'))
})
