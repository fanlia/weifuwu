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
  { file: 'src/routes/admin.ts', match: 'FROM messages m JOIN agents', reason: '平台管理员聚合（requireAdmin 保护，管理员有权看全平台）' },
  { file: 'src/routes/admin.ts', match: 'FROM agent_logs WHERE created_at', reason: '平台管理员聚合（requireAdmin 保护）' },
  { file: 'src/routes/agents.ts', match: 'FROM agent_logs WHERE agent_id = ${params.id}', reason: '间接隔离——上游 GET /api/agents/:id 已校验 a.app_id（171 行）' },
  { file: 'src/routes/agents.ts', match: 'WHERE department_id = ${body.department_id}', reason: '组织层级唯一性检查——department_id 来自同 app 部门校验（上一步 SELECT id FROM departments）' },
  { file: 'src/routes/agents.ts', match: 'FROM department_members dm JOIN agents a ON a.id = dm.agent_id WHERE dm.department_id = ${body.department_id}', reason: '经理提示词成员名单——department_id 来自同 app 部门校验（间接隔离）' },
  { file: 'src/routes/departments.ts', match: 'UPDATE agents SET system_prompt', reason: '经理提示词回填——按主键 id 更新（mgr.id 来自刚 INSERT 的 RETURNING）' },
  { file: 'src/routes/agents.ts', match: 'INSERT INTO department_members (department_id, agent_id, role)', reason: '组织层级：经理自动入代表部门——department_id 来自同 app 部门校验（间接隔离）' },
  { file: 'src/tools/builtin.ts', match: 'SELECT dm.department_id FROM department_members dm', reason: 'call_agent 委托目标部门解析——ta.id 来自同租户查询（type IN + app_id）' },
  { file: 'src/routes/departments.ts', match: 'SELECT COUNT(*)::int as n FROM department_members', reason: '组织层级子部门成员数——subDeptId 来自同 app 部门校验（间接隔离）' },
  { file: 'src/routes/departments.ts', match: 'INSERT INTO department_members', reason: '间接隔离——上游已校验部门/Agent 归属（app_id）' },
  { file: 'src/routes/departments.ts', match: 'FROM department_members dm JOIN agents', reason: '间接隔离——department_id 上游已校验归属' },
  { file: 'src/routes/departments.ts', match: 'FROM messages m JOIN agents a ON a.id = m.sender_id', reason: 'P1 工作区聚合——department_id 上游已校验归属（部门存在性校验后）' },
  { file: 'src/routes/departments.ts', match: 'DELETE FROM department_members WHERE department_id', reason: '间接隔离——上游部门归属校验（G7 权限闸门）' },
  { file: 'src/routes/knowledge.ts', match: 'kb_documents WHERE agent_id = ${params.id}', reason: '间接隔离——上游已校验 agent 归属（a.app_id）' },
  { file: 'src/routes/knowledge.ts', match: 'kb_chunks WHERE document_id', reason: '间接隔离——doc 查询带 a.app_id（54 行），document_id 来自已校验 doc' },
  { file: 'src/routes/knowledge.ts', match: 'DELETE FROM kb_chunks', reason: '间接隔离——doc.id 来自已校验查询（agent_id 归属）' },
  { file: 'src/routes/knowledge.ts', match: 'UPDATE kb_documents SET chunk_count', reason: '间接隔离——doc.id 来自已校验查询' },
  { file: 'src/routes/knowledge.ts', match: 'INSERT INTO kb_chunks', reason: '间接隔离——document_id 来自已校验 doc（含 agent_id 写入）' },
  { file: 'src/routes/sandboxes.ts', match: 'FROM departments WHERE id = ANY', reason: '间接隔离——deptIds 来自已隔离的 sandboxes 列表（manager.list 带 app_id）' },
  { file: 'src/services/agent-runner.ts', match: 'SELECT is_dm, workspace_path', reason: '间接隔离——departmentId 来自运行上下文（会话执行已校验部门归属；含产物审批模式列）' },
  { file: 'src/services/artifact-review.ts', match: 'SELECT workspace_path FROM departments', reason: '产物审批待审区——departmentId 来自审批 API（上游已校验部门归属）' },
  { file: 'src/services/chat.ts', match: 'SELECT is_dm, workspace_path FROM departments', reason: '间接隔离——departmentId 来自消息路由上下文（已校验部门归属）' },
  { file: 'src/sandbox/manager.ts', match: 'FROM sandboxes WHERE department_id = ${departmentId}', reason: '间接隔离——departmentId 来自调用方上下文（工具执行/部门删除已校验归属）' },
  { file: 'src/sandbox/manager.ts', match: 'UPDATE sandboxes SET', reason: '按主键 id 更新——id 来自已校验的 row（服务层内部）' },
  { file: 'src/sandbox/manager.ts', match: 'FROM sandbox_events WHERE sandbox_id', reason: '事件历史（诊断）——按 sandbox_id 主键查询（服务层内部）' },
  { file: 'src/sandbox/manager.ts', match: 'SELECT * FROM sandboxes WHERE status IN', reason: '后台回收扫描（reconcile 平台级状态对齐——不返回租户数据）' },
  { file: 'src/sandbox/manager.ts', match: 'SUM(memory_mb)', reason: '池内存预算聚合（平台级——只算总量不返回租户数据）' },
  { file: 'src/sandbox/manager.ts', match: 'ORDER BY last_used_at ASC NULLS FIRST', reason: '池预算驱逐扫描（平台级——驱逐不返回租户数据）' },
  { file: 'src/sandbox/manager.ts', match: 'SELECT status, COUNT(*)::int as n FROM sandboxes GROUP BY status', reason: 'P3-3 状态计数（平台级聚合——/api/metrics 不返回租户数据）' },
  { file: 'src/sandbox/manager.ts', match: 'DELETE FROM sandboxes WHERE status', reason: 'terminated 历史清理（平台级——不返回租户数据）' },
  { file: 'src/routes/knowledge.ts', match: 'INSERT INTO kb_documents', reason: '间接隔离——agentId 来自已校验 agent（路由前 a.app_id 检查）' },
  { file: 'src/routes/knowledge.ts', match: 'FROM kb_chunks kc JOIN kb_documen', reason: '间接隔离——kb agent_id 上游校验（KB 检索入口）' },
  { file: 'src/routes/messages.ts', match: 'INSERT INTO messages', reason: '间接隔离——department_id 上游校验部门归属（发消息路由）' },
  { file: 'src/routes/messages.ts', match: 'UPDATE messages SET content', reason: '间接隔离——先查 msg（a.app_id）再改（264 行同 DELETE 模式）' },
  { file: 'src/routes/messages.ts', match: 'DELETE FROM messages WHERE id', reason: '间接隔离——先查 msg（WHERE a.app_id = appId）再删（308 行）' },
  { file: 'src/services/chat.ts', match: 'SELECT artifact_review FROM departments', reason: '产物审批 pending 标记——departmentId 来自消息路由上下文（已校验部门归属）' },
  { file: 'src/services/chat.ts', match: 'FROM messages m JOIN agents', reason: '间接隔离——department_id 来自已校验部门（会话上下文）' },
  { file: 'src/services/chat.ts', match: 'UPDATE messages SET content = ${event.content} WHERE id = ${event.messageId}', reason: '按主键 UUID 更新（wf:done 落库）——id 归属在消息创建时已校验，无跨租户路径' },
  { file: 'src/services/permissions.ts', match: 'SELECT dm.role FROM department_members', reason: '间接隔离——departmentId 来自调用方上下文（审批/成员管理已校验归属）' },
  { file: 'src/services/permissions.ts', match: 'FROM _weifuwu_app_members', reason: '系统表（框架 userSystem 平台级隔离）' },
  { file: 'src/services/agent-runner.ts', match: 'SELECT type, department_id FROM agents', reason: '组织层级经理工作目录解析——agentId 来自运行上下文（已校验的 agent）' },
  { file: 'src/services/org-manager.ts', match: 'WHERE department_id = ${departmentId}', reason: '组织层级经理查询——departmentId 来自成员变更路由（上游已校验部门归属）' },
  { file: 'src/services/org-manager.ts', match: 'FROM department_members dm JOIN agents a ON a.id = dm.agent_id', reason: '经理提示词成员名单——departmentId 来自成员变更路由（间接隔离）' },
  { file: 'src/services/org-manager.ts', match: 'UPDATE agents SET system_prompt', reason: '经理提示词回填——按主键 id 更新（mgr.id 来自同函数查询）' },
  { file: 'src/services/agent-runner.ts', match: 'SELECT risk_policy FROM agents', reason: 'C2 间接隔离——agentId 来自运行上下文（已校验的 agent）' },
  { file: 'src/services/agent-runner.ts', match: 'SELECT light_model FROM agents', reason: 'C5 间接隔离——agentId 来自运行上下文（已校验的 agent）' },
  { file: 'src/services/agent-runner.ts', match: 'agent_memories', reason: 'C3 间接隔离——agentId 来自运行上下文（已校验的 agent）' },
  { file: 'src/routes/agents.ts', match: 'agent_memories', reason: 'C3 间接隔离——先查 agent 归属（a.app_id）再读/删记忆' },
  { file: 'src/routes/agents.ts', match: 'WHERE sender_id = ${params.id}', reason: 'C4 间接隔离——先查 agent 归属（a.app_id）再统计反馈' },
  { file: 'server.ts', match: 'WHERE a.user_id = ${uid}', reason: 'R10 用户维度隔离——uid 来自会话 token（auth.userId），只能查/改自己' },
  { file: 'server.ts', match: 'UPDATE agents SET is_active = FALSE', reason: 'R10 用户维度隔离——账号删除仅匿名化自己的 Agent' },
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
  { file: 'src/services/chat.ts', match: 'SELECT attachments FROM messages WHERE id = ${messageId}', reason: '附件读取（P1-3）——按主键查，messageId 来自本流程创建的消息' },
  { file: 'src/services/chat.ts', match: 'SELECT attachments FROM messages WHERE department_id = ${departmentId}', reason: 'SSE 附件读取（P1-3）——部门上下文已校验（消息流入口）' },
  { file: 'src/services/group-memory.ts', match: 'FROM messages m JOIN agents a ON a.id = m.sender_id WHERE m.department_id = ${departmentId}', reason: '群共识摘要（P4）——按部门主键操作，部门上下文来自消息流入口（已校验）' },
  { file: 'src/services/group-memory.ts', match: 'INSERT INTO group_memories (department_id', reason: '群共识计数/摘要 upsert（P4）——department_id 主键，同上' },
  { file: 'src/services/chat.ts', match: 'SELECT summary FROM group_memories WHERE department_id = ${departmentId}', reason: '群共识读取（P4）——按部门主键，同消息流部门上下文' },
  { file: 'src/services/agent-runner.ts', match: 'INSERT INTO agent_run_states', reason: '执行状态（C1）——含 app_id 列，租户隔离' },
  { file: 'src/services/agent-runner.ts', match: 'UPDATE agent_run_states SET', reason: '执行状态更新（C1）——WHERE message_id 主键（消息归属已校验）' },
  { file: 'src/routes/messages.ts', match: 'SELECT steps, status FROM agent_run_states WHERE message_id', reason: '断点查询（C1）——按主键，消息归属上游校验（a.app_id）' },
  { file: 'src/routes/messages.ts', match: 'UPDATE messages SET attachments = ${JSON.stringify(attachmentMeta)}', reason: '附件元数据落库（P1-3）——按主键更新，message 本流程刚创建' },
  { file: 'src/services/chat.ts', match: 'FROM department_members dm JOIN agents', reason: '间接隔离——departmentId 来自已校验部门' },
  { file: 'src/services/chat.ts', match: 'FROM kb_chunks kc JOIN kb_documents', reason: '间接隔离——kb.agent_id 来自部门成员查询（已校验）' },
  { file: 'src/services/chat.ts', match: 'FROM agent_skills', reason: '间接隔离——agentId 运行上下文' },
  { file: 'src/services/embedding.ts', match: 'FROM kb_chunks kc JOIN kb_documents', reason: '间接隔离——agent_id 调用方传入（检索上下文已校验）' },
  { file: 'src/services/versions.ts', match: 'FROM agent_versions WHERE agent_id', reason: '间接隔离——agentId 来自已校验 agent（版本管理路由）' },
  { file: 'src/services/webhook.ts', match: 'webhook_logs WHERE agent_id = ${agentId}', reason: '间接隔离——agentId 来自 webhook 请求（签名 + agent 归属校验）' },
  { file: 'src/tools/builtin.ts', match: 'FROM kb_chunks kc JOIN kb_documents', reason: '间接隔离——kb agent_id 工具上下文（沙盒内工具，归属受限）' },
  { file: 'src/tools/builtin.ts', match: 'SELECT name FROM agents WHERE id = ${callerId}', reason: '委托背景（P1-4）——按主键 UUID 查名，callerId 来自当前执行的 agent（归属已由调用链保证）' },
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
