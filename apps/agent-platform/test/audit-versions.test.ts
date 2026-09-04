/**
 * Wave 9 服务测试 — 审计日志 + Agent 版本管理
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgres, WEIFUWU_USER_SCHEMA } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'

import { writeAudit, listAudit } from '../src/services/audit.ts'
import { saveVersion, listVersions, rollbackVersion } from '../src/services/versions.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ID = '00000000-0000-0000-0000-000000000001'
const AGENT_ID = '00000000-0000-0000-0000-000000000030'

let pg: any

before(async () => {
  pg = postgres({ memory: true })
  // 协议层 = AST：声明式建库（migrateModule——零 SQL 文本）；memory 实例无残留（DROP 不需要）
  await pg.migrateModule('test-full', AGENT_PLATFORM_SCHEMA as never)
  await pg.migrateModule('test-users', WEIFUWU_USER_SCHEMA as never)
  await pg.orm.query.insert('agents').rows([{ id: AGENT_ID, app_id: APP_ID, type: 'ai', name: 'AI Bot', system_prompt: '你是AI助手' }]).run()
})

after(async () => {
  if (pg) await pg.close()
})

function makeCtx() {
  return { sql: pg.sql, orm: (pg as any).orm, appId: APP_ID, user: { id: '00000000-0000-0000-0000-000000000099' } }
}

describe('审计日志服务', () => {
  it('writeAudit 写入 + listAudit 按租户查回', async () => {
    await writeAudit(makeCtx() as any, { action: 'login_success', target_type: 'app', target_id: APP_ID, detail: { email: 'test@x.com' } })
    await writeAudit(makeCtx() as any, { action: 'agent_create', target_type: 'agent', target_id: AGENT_ID, detail: { name: 'AI Bot' } })
    const { entries, total } = await listAudit(makeCtx() as any, { limit: 10 })
    assert.equal(total, 2)
    assert.equal(entries[0].action, 'agent_create')
    assert.equal(entries[1].action, 'login_success')
  })

  it('listAudit 按 action 过滤', async () => {
    const { entries } = await listAudit(makeCtx() as any, { action: 'login_success' })
    assert.equal(entries.length, 1)
    assert.equal(entries[0].action, 'login_success')
  })

  it('listAudit 租户隔离（其他 app 查不到）', async () => {
    const other = { sql: pg.sql, orm: (pg as any).orm, appId: '00000000-0000-0000-0000-000000000099' }
    const { entries, total } = await listAudit(other as any, { limit: 10 })
    assert.equal(total, 0)
    assert.equal(entries.length, 0)
  })
})

describe('Agent 版本管理服务', () => {
  it('saveVersion 保存快照 + version 递增', async () => {
    const v1 = await saveVersion(makeCtx() as any, AGENT_ID, '初始版本')
    assert.equal(v1?.version, 1)
    const v2 = await saveVersion(makeCtx() as any, AGENT_ID, '第二版')
    assert.equal(v2?.version, 2)
  })

  it('listVersions 返回快照内容（含 system_prompt）', async () => {
    const versions = await listVersions(makeCtx() as any, AGENT_ID)
    assert.equal(versions.length, 2)
    assert.equal(versions[0].version, 2)
    assert.equal(versions[0].snapshot.system_prompt, '你是AI助手')
  })

  it('saveVersion 快照含名称/描述（回滚可恢复）', async () => {
    const versions = await listVersions(makeCtx() as any, AGENT_ID)
    assert.ok(versions[0].snapshot.name !== undefined, '快照含 name')
    assert.ok(versions[0].snapshot.description !== undefined, '快照含 description')
  })

  it('rollbackVersion 恢复配置（含 name/description）', async () => {
    // 修改配置（含名称/描述）
    await pg.orm.query.update('agents').set({ system_prompt: '修改后的提示', name: '改名后', description: '改描述', updated_at: { __now: true } as never }).where({ id: { eq: AGENT_ID } }).run()
    // 回滚到 v1
    const versions = await listVersions(makeCtx() as any, AGENT_ID)
    const v1 = versions.find((v: any) => v.version === 1)
    const result = await rollbackVersion(makeCtx() as any, AGENT_ID, v1.id)
    assert.equal(result.ok, true)
    const [agent] = await pg.orm.query.from('agents').select('system_prompt', 'name', 'description').where({ id: { eq: AGENT_ID } }).run()
    assert.equal(agent.system_prompt, '你是AI助手', '回滚后 system_prompt 恢复')
    assert.equal(agent.name, 'AI Bot', '回滚后名称恢复')
    assert.equal(agent.description, null, '回滚后描述恢复')
  })
})
