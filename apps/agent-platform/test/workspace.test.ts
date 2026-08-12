/**
 * 工作空间文件浏览器 API 测试（F8）——list/read/write/路径穿越/租户隔离
 * 用独立临时目录模拟 workspace（不依赖 docker——文件浏览器是宿主管理面）
 */

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveWorkspacePath } from '../src/routes/workspace.ts'

let ws: string

before(async () => {
  ws = await mkdtemp(join(tmpdir(), 'ws-api-'))
  await writeFile(join(ws, 'a.txt'), 'hello')
  await writeFile(join(ws, 'sub', 'b.txt'), 'nested').catch(async () => {
    const { mkdir } = await import('node:fs/promises')
    await mkdir(join(ws, 'sub'), { recursive: true })
    await writeFile(join(ws, 'sub', 'b.txt'), 'nested')
  })
})

after(async () => {
  await rm(ws, { recursive: true, force: true })
})

test('F8a: resolveWorkspacePath 路径穿越防护', () => {
  // 正常路径
  assert.equal(resolveWorkspacePath(ws, 'a.txt'), join(ws, 'a.txt'))
  assert.equal(resolveWorkspacePath(ws, ''), ws)
  // 穿越拒绝
  assert.throws(() => resolveWorkspacePath(ws, '../../etc/passwd'))
  assert.throws(() => resolveWorkspacePath(ws, 'sub/../../../etc'))
  // 绝对路径被 join 限制在 workspace 内（不穿越——行为正确）
  assert.equal(resolveWorkspacePath(ws, '/etc/passwd'), join(ws, 'etc', 'passwd'))
})

test('F8b: resolveWorkspacePath 允许子目录', () => {
  assert.equal(resolveWorkspacePath(ws, 'sub/b.txt'), join(ws, 'sub', 'b.txt'))
  assert.equal(resolveWorkspacePath(ws, 'sub'), join(ws, 'sub'))
})

test('F8c: 边界——根路径本身允许', () => {
  // resolve(ws, '.') === ws
  assert.equal(resolveWorkspacePath(ws, '.'), ws)
  assert.equal(resolveWorkspacePath(ws, './'), ws)
})

test('F8d: 前缀相似目录穿越拒绝（../ws-evil 不在 ws 内）', () => {
  assert.throws(() => resolveWorkspacePath(ws, '../' + ws.split('/').pop() + '-evil'))
  assert.throws(() => resolveWorkspacePath(ws, 'sub/../../' + ws.split('/').pop() + '-x'))
})
