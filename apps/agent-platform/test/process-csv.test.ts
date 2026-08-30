/**
 * process-csv 技能 read_csv handler 测试（2027-09——「无部门上下文」根因锁定）
 *
 * 根因：agent-runner 工具 run 包装的 _toolDepartmentId 注入在 skillRegistry
 * 分支**之后**——技能工具（read_csv 为 process-csv 技能）先走 skill 分支
 * 返回——注入从未发生 → handler 读空 → 「无部门上下文」（用户实测
 * 「订单.csv 有多少条」——工具调用必失败——与参数无关）。
 * 修复：注入提前到 run 开头（skill/全局工具两分支均可见）。
 *
 * 本测试锁定 handler 契约面：ctx 注入 _toolDepartmentId → 正常解析；
 * 未注入 → 显式「无部门上下文」（不静默——错误可观测）。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let wsRoot: string

before(async () => {
  wsRoot = await mkdtemp(join(tmpdir(), 'csv-skill-'))
  process.env.AGENT_WORKSPACE_ROOT = wsRoot
})

after(async () => {
  delete process.env.AGENT_WORKSPACE_ROOT
  await rm(wsRoot, { recursive: true, force: true })
})

function makeCtx(): any {
  return { sql: async () => [{ workspace_path: null }] }
}

test('read_csv：toolCtx.departmentId 注入 → 行数/表头/汇总正确', async () => {
  const { createHandlers } = await import('../skills/builtin/process-csv/tools.ts')
  const deptId = 'dept-csv-1'
  await mkdir(join(wsRoot, deptId), { recursive: true })
  await writeFile(join(wsRoot, deptId, '订单.csv'), [
    '商品,数量,金额',
    '苹果,3,15.5',
    '香蕉,5,20',
    '橙子,2,9.9',
  ].join('\n'), 'utf-8')
  const handlers = createHandlers(() => makeCtx())
  // toolCtx 通道（2027-09）：业务上下文经参数——不再 ctx 注入属性
  const r = await handlers.read_csv({ path: '订单.csv' }, { departmentId: deptId, agentId: 'ai-1' }) as any
  assert.equal(r.ok, true, `应成功——实际: ${JSON.stringify(r)}`)
  assert.equal(r.rowCount, 3, '数据行数应为 3（不含表头）')
  assert.deepEqual(r.headers, ['商品', '数量', '金额'])
  assert.ok((r.summary ?? '').includes('合计 45.4'), '金额列汇总应正确')
})

test('read_csv：无 toolCtx.departmentId → 显式「无部门上下文」（不静默）', async () => {
  const { createHandlers } = await import('../skills/builtin/process-csv/tools.ts')
  const handlers = createHandlers(() => makeCtx())
  const r = await handlers.read_csv({ path: '订单.csv' }) as any
  assert.equal(r.ok, false)
  assert.equal(r.error, '无部门上下文')
})
