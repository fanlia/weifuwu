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
  const re = /(?:^\s*sql\s*`|\bsql\s*`|\.unsafe\(\s*`|runMigration\(\s*[^,]+,\s*`)/g
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
