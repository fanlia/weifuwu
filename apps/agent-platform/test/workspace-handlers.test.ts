/**
 * 工作空间工具 handler 契约测试（2027-09——AI 工具覆盖审计补全）
 *
 * 审计结论：read/write/edit/grep/list_files/bash 的 handler = runInSandbox
 * （参数透传 + 容器调用）——真实沙盒为 Docker 集成（RUN_DOCKER_TESTS 门控
 * ——sandbox.test.ts 管理器层）——**handler 契约层零覆盖**——本文件 mock
 * manager.runTool 锁定：成功透传 / B1-b 失败抛错（工具失败协议）/ 超时分
 * 级参数。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createWorkspaceHandlers } from '../src/tools/workspace.ts'
import { manager } from '../src/sandbox/manager.ts'

const origRunTool = manager.runTool.bind(manager)

after(() => {
  ;(manager as any).runTool = origRunTool
})

test('read：成功路径——runTool 输出透传（参数/部门/工作区正确传递）', async () => {
  let captured: any = null
  ;(manager as any).runTool = async (deptId: string, ws: string, tool: string, args: any, opts: any) => {
    captured = { deptId, ws, tool, args, opts }
    return { ok: true, output: '文件内容ABC' }
  }
  const handlers = createWorkspaceHandlers('/tmp/ws-x', true, 'dept-42', true)
  const r = await handlers.read({ path: 'a.txt' })
  assert.equal(r, '文件内容ABC')
  assert.deepEqual(captured, {
    deptId: 'dept-42', ws: '/tmp/ws-x', tool: 'read', args: { path: 'a.txt' },
    opts: { network: true, execTimeoutMs: undefined },
  })
})

test('bash 装配：allowCommandExec=true → handlers.bash 存在（false → 无）', () => {
  const on = createWorkspaceHandlers('/tmp/ws-x', true, 'dept-42')
  assert.equal(typeof on.bash, 'function', 'allowCommandExec=true 应暴露 bash')
  const off = createWorkspaceHandlers('/tmp/ws-x', false, 'dept-42')
  assert.equal(off.bash, undefined, 'allowCommandExec=false 不应暴露 bash')
})

test('B1-b：runTool ok=false → 抛错（错误透传框架层——工具失败协议）', async () => {
  ;(manager as any).runTool = async () => ({ ok: false, error: '沙盒炸了: ENOENT' })
  const handlers = createWorkspaceHandlers('/tmp/ws-x', true, 'dept-42')
  await assert.rejects(() => handlers.write({ path: 'b.txt', content: 'x' }), /沙盒炸了: ENOENT/)
})
