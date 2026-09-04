/**
 * 租户隔离审计测试 — R1（SaaS 生死线：漏写 app_id = 跨租户泄漏）
 *
 * 静态扫描 agent-platform 全部 SQL（server.ts + src/routes + src/services + ...）：
 *   1. 涉及租户业务表的查询必须隔离——直接（含 app_id）或间接（外键归属上游已校验，登记豁免）
 *   2. 豁免登记表（文件 + SQL 特征 + 理由）——新增豁免必须带理由，审查后登记
 *   3. 未登记豁免且无 app_id = 违规（泄漏在开发期暴露）
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** 租户业务表（按 app_id 隔离；新增业务表必须登记） */
const BUSINESS_TABLES = [
  'agents', 'departments', 'department_members', 'messages', 'agent_logs',
  'webhook_logs', 'kb_documents', 'kb_chunks', 'audit_logs', 'app_ai_configs',
  'events', 'agent_skills', 'agent_versions', 'agent_memories', 'answer_cache', 'agent_run_states',
  'sandboxes', 'sandbox_events',
]

/** 豁免登记（文件 + SQL 特征 + 理由）——审查通过才可登记 */
const EXEMPTIONS: Array<{ file: string; match: string; reason: string }> = [
  { file: 'server.ts', match: 'information_schema', reason: '元数据检查（表存在性）' },
  { file: 'server.ts', match: 'ALTER TABLE', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'CREATE TABLE', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'CREATE INDEX', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'CREATE UNIQUE INDEX', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'DROP TABLE', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'ALTER COLUMN', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'FROM agents WHERE template_slug IS NOT NULL', reason: '平台级模板使用统计（不返回租户数据）' },
  { file: 'server.ts', match: "SELECT id, name, webhook_platform, webhook_url, im_bind_dept, webhook_secret FROM agents WHERE type = 'webhook'", reason: 'IM 入站机器人查询（G8 补强）——平台级路由：回调无租户上下文，机器人绑定部门显式配置（返回单行供消息路由，不泄漏）' },
  { file: 'server.ts', match: 'name = ANY(string_to_array', reason: '问卷一键派单（demo 端点）——按角色名查部门 id 供消息路由（demo 专用，不泄漏数据）' },
  { file: 'server.ts', match: 'WHERE id::text = ANY(string_to_array(', reason: '沙盒监控容器→agent 名映射（管理员端点）——按容器 id 反查名字，不返回租户数据' },
  { file: 'server.ts', match: 'SELECT template_slug', reason: '平台级模板使用统计（role_templates usage_count）' },
  { file: 'server.ts', match: 'FROM department_members dm JOIN agents a ON a.id = dm.agent_id WHERE dm.department_id = ${params.id}', reason: '执行面板成员——department_id 上游已校验归属（间接隔离）' },
  { file: 'server.ts', match: 'SELECT MAX(m.created_at) as at FROM messages m JOIN agents a', reason: '执行面板任务起点——department_id 上游已校验归属（间接隔离）' },
  { file: 'server.ts', match: 'WHERE a.user_id = ${uid}', reason: 'R10 用户维度隔离——uid 来自会话 token（auth.userId），只能查/改自己' },
  { file: 'server.ts', match: 'UPDATE agents SET is_active = FALSE', reason: 'R10 用户维度隔离——账号删除仅匿名化自己的 Agent' },
  // ── 间接隔离批量登记（外键归属上游已校验——逐条审查过） ──
]

/** 扫描目标文件 */
function scanFiles(): Array<{ file: string; src: string }> {
  const files: string[] = ['server.ts']
  const dirs = ['src/routes', 'src/services', 'src/middleware', 'src/sandbox', 'src/tools']
  for (const d of dirs) {
    const abs = join(root, d)
    if (!existsSync(abs)) continue
    for (const f of readdirSync(abs)) {
      if (f.endsWith('.ts')) files.push(join(d, f))
    }
  }
  return files
    .filter((f) => existsSync(join(root, f)))
    .map((f) => ({ file: f, src: readFileSync(join(root, f), 'utf-8') }))
}

/** 提取 SQL 块（sql 标签模板 + sql.unsafe）——只认真实标签调用点，
 *  防「正则字符类内反引号」类误报（2027-10 迁移后 P3 实录：PATH_RE 含 ` 被旧扫描器当模板） */
function extractSqlBlocks(src: string): Array<{ sql: string; index: number }> {
  const blocks: Array<{ sql: string; index: number }> = []
  const re = /(?:^\s*sql\s*`|\bsql\s*`|\.unsafe\(\s*`)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const start = src.indexOf('`', m.index)
    const end = src.indexOf('`', start + 1)
    if (end < 0) break
    blocks.push({ sql: src.slice(start + 1, end), index: start })
  }
  return blocks
}

describe('租户隔离审计（R1）', () => {
  const files = scanFiles()

  it('扫描范围完整（routes + services + server 全部 TS）', () => {
    assert.ok(files.length >= 15, `扫描文件数异常: ${files.length}`)
  })

  it('涉及业务表的 SQL 必须隔离（app_id 或登记豁免）——漏写 = 跨租户泄漏', () => {
    const violations: Array<{ file: string; sql: string }> = []
    for (const { file, src } of files) {
      for (const { sql } of extractSqlBlocks(src)) {
        // 直接隔离：含 app_id
        if (/\bapp_id\b/.test(sql)) continue
        // 系统表（框架 userSystem 平台级）
        if (/_weifuwu_/.test(sql)) continue
        // 不涉及业务表
        const used = BUSINESS_TABLES.filter((t) => new RegExp(`\\b${t}\\b`).test(sql))
        if (used.length === 0) continue
        // 登记豁免
        const exempt = EXEMPTIONS.some((e) => e.file === file && sql.replace(/\s+/g, ' ').includes(e.match))
        if (exempt) continue
        violations.push({ file, sql: sql.replace(/\s+/g, ' ').slice(0, 160) })
      }
    }
    assert.deepEqual(violations, [], '违规 SQL（无 app_id、无豁免登记）：\n' +
      violations.map((v) => `  ${v.file}: ${v.sql}`).join('\n'))
  })

  it('豁免登记有效性：每条豁免必须实际匹配到 SQL（防僵尸登记）', () => {
    const all = files.flatMap(({ file, src }) =>
      extractSqlBlocks(src).map((b) => ({ file, sql: b.sql })))
    for (const e of EXEMPTIONS) {
      const hit = all.some(({ file, sql }) => e.file === file && sql.replace(/\s+/g, ' ').includes(e.match))
      assert.ok(hit, `豁免未命中（僵尸登记）: ${e.file} ${e.match}`)
    }
  })
})
