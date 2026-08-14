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
  'events', 'agent_skills', 'agent_versions',
]

/** 豁免登记（文件 + SQL 特征 + 理由）——审查通过才可登记 */
const EXEMPTIONS: Array<{ file: string; match: string; reason: string }> = [
  { file: 'server.ts', match: 'information_schema', reason: '元数据检查（表存在性）' },
  { file: 'server.ts', match: 'ALTER TABLE', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'CREATE TABLE', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'DROP TABLE', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'ALTER COLUMN', reason: 'DDL migration（schema 级）' },
  { file: 'server.ts', match: 'FROM agents WHERE template_slug IS NOT NULL', reason: '平台级模板使用统计（不返回租户数据）' },
  { file: 'server.ts', match: 'SELECT template_slug', reason: '平台级模板使用统计（role_templates usage_count）' },
  { file: 'src/routes/admin.ts', match: 'FROM messages m JOIN agents', reason: '平台管理员聚合（requireAdmin 保护，管理员有权看全平台）' },
  { file: 'src/routes/admin.ts', match: 'FROM agent_logs WHERE created_at', reason: '平台管理员聚合（requireAdmin 保护）' },
  { file: 'src/routes/agents.ts', match: 'FROM agent_logs WHERE agent_id = ${params.id}', reason: '间接隔离——上游 GET /api/agents/:id 已校验 a.app_id（171 行）' },
  { file: 'src/routes/departments.ts', match: 'INSERT INTO department_members', reason: '间接隔离——上游已校验部门/Agent 归属（app_id）' },
  { file: 'src/routes/departments.ts', match: 'FROM department_members dm JOIN agents', reason: '间接隔离——department_id 上游已校验归属' },
  { file: 'src/routes/departments.ts', match: 'DELETE FROM department_members WHERE department_id', reason: '间接隔离——上游部门归属校验（G7 权限闸门）' },
  { file: 'src/routes/knowledge.ts', match: 'kb_documents WHERE agent_id = ${params.id}', reason: '间接隔离——上游已校验 agent 归属（a.app_id）' },
  { file: 'src/routes/knowledge.ts', match: 'kb_chunks WHERE document_id', reason: '间接隔离——doc 查询带 a.app_id（54 行），document_id 来自已校验 doc' },
  { file: 'src/routes/knowledge.ts', match: 'DELETE FROM kb_chunks', reason: '间接隔离——doc.id 来自已校验查询（agent_id 归属）' },
  { file: 'src/routes/knowledge.ts', match: 'UPDATE kb_documents SET chunk_count', reason: '间接隔离——doc.id 来自已校验查询' },
  { file: 'src/routes/knowledge.ts', match: 'INSERT INTO kb_chunks', reason: '间接隔离——document_id 来自已校验 doc（含 agent_id 写入）' },
  { file: 'src/routes/knowledge.ts', match: 'INSERT INTO kb_documents', reason: '间接隔离——agentId 来自已校验 agent（路由前 a.app_id 检查）' },
  { file: 'src/routes/knowledge.ts', match: 'FROM kb_chunks kc JOIN kb_documen', reason: '间接隔离——kb agent_id 上游校验（KB 检索入口）' },
  { file: 'src/routes/messages.ts', match: 'INSERT INTO messages', reason: '间接隔离——department_id 上游校验部门归属（发消息路由）' },
  { file: 'src/routes/messages.ts', match: 'UPDATE messages SET content', reason: '间接隔离——先查 msg（a.app_id）再改（264 行同 DELETE 模式）' },
  { file: 'src/routes/messages.ts', match: 'DELETE FROM messages WHERE id', reason: '间接隔离——先查 msg（WHERE a.app_id = appId）再删（308 行）' },
  { file: 'src/services/chat.ts', match: 'FROM messages m JOIN agents', reason: '间接隔离——department_id 来自已校验部门（会话上下文）' },
  // ── 间接隔离批量登记（外键归属上游已校验——逐条审查过） ──
  { file: 'src/routes/agents.ts', match: 'total_tokens', reason: '间接隔离——agent_id 来自上方 agents 列表（已 WHERE app_id，74 行）' },
  { file: 'src/routes/departments.ts', match: 'dm1.agent_id = ${me.id}', reason: '间接隔离——me 是当前用户 Agent（app_id 限定）；target 上游校验（47 行 a.app_id）' },
  { file: 'src/routes/messages.ts', match: 'WHERE m.department_id = ${params.id}', reason: '间接隔离——部门存在性校验带 app_id（39 行）' },
  { file: 'src/routes/messages.ts', match: 'SELECT dm.role FROM department_members', reason: '间接隔离——msg.department_id 来自已校验消息（审批 321 行）' },
  { file: 'src/routes/messages.ts', match: 'UPDATE messages SET ai_approved', reason: '间接隔离——审批先查 msg（a.app_id，321 行）' },
  { file: 'src/routes/messages.ts', match: 'UPDATE messages SET feedback', reason: '间接隔离——反馈先查 msg（a.app_id + type=ai）' },
  { file: 'src/routes/messages.ts', match: 'UPDATE messages SET ai_draft = ${draft}', reason: '间接隔离——草稿编辑先查 msg（a.app_id + 待审批）' },
  { file: 'src/routes/messages.ts', match: 'UPDATE messages SET content = ai_draft', reason: '间接隔离——审批先查 msg（a.app_id）' },
  { file: 'src/routes/role-templates.ts', match: 'INSERT INTO agent_skills', reason: '间接隔离——agent.id 来自同请求刚创建的 Agent（带 app_id）' },
  { file: 'src/routes/skills.ts', match: 'agent_skills', reason: '间接隔离——agent_id/skillId 上游已校验归属（skills 路由 a.app_id）' },
  { file: 'src/services/agent-runner.ts', match: 'agent_skills', reason: '间接隔离——agentId 来自运行上下文（已校验的 agent）' },
  { file: 'src/services/chat.ts', match: 'INSERT INTO messages', reason: '间接隔离——departmentId 来自已校验部门（会话上下文）' },
  { file: 'src/services/chat.ts', match: 'DELETE FROM messages WHERE id = ${msgId}', reason: '间接隔离——msgId 本流程创建（占位消息清理）' },
  { file: 'src/services/chat.ts', match: 'UPDATE messages SET content = ${accumulatedContent}', reason: '间接隔离——msgId 本流程创建（流式回复落库）' },
  { file: 'src/services/chat.ts', match: 'FROM agent_logs WHERE agent_id = ${agent.id}', reason: '间接隔离——agent 来自已校验查询（部门成员）' },
  { file: 'src/services/chat.ts', match: 'FROM department_members dm JOIN agents', reason: '间接隔离——departmentId 来自已校验部门' },
  { file: 'src/services/chat.ts', match: 'FROM kb_chunks kc JOIN kb_documents', reason: '间接隔离——kb.agent_id 来自部门成员查询（已校验）' },
  { file: 'src/services/chat.ts', match: 'FROM agent_skills', reason: '间接隔离——agentId 运行上下文' },
  { file: 'src/services/embedding.ts', match: 'FROM kb_chunks kc JOIN kb_documents', reason: '间接隔离——agent_id 调用方传入（检索上下文已校验）' },
  { file: 'src/services/versions.ts', match: 'FROM agent_versions WHERE agent_id', reason: '间接隔离——agentId 来自已校验 agent（版本管理路由）' },
  { file: 'src/services/webhook.ts', match: 'webhook_logs WHERE agent_id = ${agentId}', reason: '间接隔离——agentId 来自 webhook 请求（签名 + agent 归属校验）' },
  { file: 'src/tools/builtin.ts', match: 'FROM kb_chunks kc JOIN kb_documents', reason: '间接隔离——kb agent_id 工具上下文（沙盒内工具，归属受限）' },
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

/** 提取 SQL 块（sql 模板 + sql.unsafe） */
function extractSqlBlocks(src: string): Array<{ sql: string; index: number }> {
  const blocks: Array<{ sql: string; index: number }> = []
  const re = /`([\s\S]*?)`/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 40), m.index)
    if (/\bsql\b/.test(before) || /unsafe\(/.test(before)) blocks.push({ sql: m[1], index: m.index })
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
