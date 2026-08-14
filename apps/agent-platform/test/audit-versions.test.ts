/**
 * Wave 9 服务测试 — 审计日志 + Agent 版本管理
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgres } from 'weifuwu'
import { writeAudit, listAudit } from '../src/services/audit.ts'
import { saveVersion, listVersions, rollbackVersion } from '../src/services/versions.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ID = '00000000-0000-0000-0000-000000000001'
const AGENT_ID = '00000000-0000-0000-0000-000000000030'

let pg: any

before(async () => {
  pg = postgres(process.env.TEST_DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo_audit_test', { max: 5, closeTimeout: 1 })
  const schema = readFileSync(resolve(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8')
  await pg.sql.unsafe(`
    DROP TABLE IF EXISTS agent_versions CASCADE;
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS agent_logs CASCADE;
    DROP TABLE IF EXISTS kb_chunks CASCADE;
    DROP TABLE IF EXISTS kb_documents CASCADE;
    DROP TABLE IF EXISTS messages CASCADE;
    DROP TABLE IF EXISTS department_members CASCADE;
    DROP TABLE IF EXISTS departments CASCADE;
    DROP TABLE IF EXISTS agents CASCADE;
    DROP TYPE IF EXISTS agent_type CASCADE;
  `)
  await pg.sql.unsafe(schema)
  // 增量表（schema.sql 含——直接建）
  // 框架 userSystem 表（audit JOIN user_name 依赖——新库需补建）
  await pg.sql.unsafe(`CREATE TABLE IF NOT EXISTS _weifuwu_users (id UUID PRIMARY KEY, name TEXT, email TEXT, app_id UUID, created_at TIMESTAMPTZ DEFAULT NOW())`)
  await pg.sql.unsafe(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), app_id UUID NOT NULL, user_id UUID,
      action TEXT NOT NULL, target_type TEXT, target_id UUID, detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS agent_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
      app_id UUID NOT NULL, version INT NOT NULL, snapshot JSONB NOT NULL, note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (agent_id, version)
    );
  `)
  await pg.sql`INSERT INTO agents (id, app_id, type, name, system_prompt) VALUES (${AGENT_ID}, ${APP_ID}, 'ai', 'AI Bot', '你是AI助手')`
})

after(async () => {
  if (pg) await pg.close()
})

function makeCtx() {
  return { sql: pg.sql, appId: APP_ID, user: { id: '00000000-0000-0000-0000-000000000099' } }
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
    const other = { sql: pg.sql, appId: '00000000-0000-0000-0000-000000000099' }
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
    await pg.sql`UPDATE agents SET system_prompt = '修改后的提示', name = '改名后', description = '改描述', updated_at = NOW() WHERE id = ${AGENT_ID}`
    // 回滚到 v1
    const versions = await listVersions(makeCtx() as any, AGENT_ID)
    const v1 = versions.find((v: any) => v.version === 1)
    const result = await rollbackVersion(makeCtx() as any, AGENT_ID, v1.id)
    assert.equal(result.ok, true)
    const [agent] = await pg.sql`SELECT system_prompt, name, description FROM agents WHERE id = ${AGENT_ID}`
    assert.equal(agent.system_prompt, '你是AI助手', '回滚后 system_prompt 恢复')
    assert.equal(agent.name, 'AI Bot', '回滚后名称恢复')
    assert.equal(agent.description, null, '回滚后描述恢复')
  })
})
