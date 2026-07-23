/**
 * 种子数据脚本 — 首次启动时初始化演示数据
 *
 * 用法: node --env-file=.env apps/agent-platform/seed.ts
 */

import { postgres } from 'weifuwu'
import { hashPassword } from './src/services/password.ts'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  console.log('[seed] 开始初始化演示数据...\n')

  const pg = postgres()
  const { sql } = pg

  // ── 运行 schema 迁移 ──────────────────────────────────
  await pg.migrate()
  const schemaPath = resolve(__dirname, 'src', 'db', 'schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')
  await sql.unsafe(schema)
  console.log('  ✓ schema 已应用')

  // ── 检查是否已有数据 ────────────────────────────────
  const [existingTenants] = await sql`SELECT COUNT(*)::int as count FROM tenants`
  if (existingTenants.count > 0) {
    console.log('  - 检测到已有数据，跳过 seed')
    await pg.close()
    return
  }

  // ── 租户 ────────────────────────────────────────────
  const [tenant] = await sql`
    INSERT INTO tenants (name, slug)
    VALUES ('演示公司', 'demo')
    RETURNING id
  `
  console.log('  ✓ 租户: 演示公司')

  // ── 管理员用户 ──────────────────────────────────────
  const adminPassword = await hashPassword('admin123')
  const [admin] = await sql`
    INSERT INTO users (tenant_id, email, name, password_hash, role)
    VALUES (${tenant.id}, 'admin@demo.com', '管理员', ${adminPassword}, 'admin')
    RETURNING id, email, name, role
  `
  console.log(`  ✓ 管理员: ${admin.email} / admin123`)

  // ── 普通用户 ────────────────────────────────────────
  const userPassword = await hashPassword('user123')
  const [user] = await sql`
    INSERT INTO users (tenant_id, email, name, password_hash, role)
    VALUES (${tenant.id}, 'user@demo.com', '演示用户', ${userPassword}, 'member')
    RETURNING id, email, name, role
  `
  console.log(`  ✓ 用户: ${user.email} / user123`)

  // ── 用户 Agent（真实用户映射） ──────────────────────────
  const [adminAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, user_id, is_active)
    VALUES (${tenant.id}, 'user', ${admin.name}, ${admin.id}, true)
    RETURNING id
  `
  const [userAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, user_id, is_active)
    VALUES (${tenant.id}, 'user', ${user.name}, ${user.id}, true)
    RETURNING id
  `
  console.log('  ✓ 用户 Agent: 管理员, 演示用户')

  // ── AI Agent ────────────────────────────────────────
  const [aiAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, model, system_prompt, temperature, max_tokens, is_active)
    VALUES (${tenant.id}, 'ai', '小悟助手', '通用 AI 助手，回答各类问题', 'deepseek-chat', '你是一个有帮助的 AI 助手，名叫小悟。回答简洁、准确、友好。', 0.7, 2048, true)
    RETURNING id
  `
  console.log('  ✓ AI Agent: 小悟助手')

  // ── 演示公司 ────────────────────────────────────────
  const [company] = await sql`
    INSERT INTO companies (tenant_id, name)
    VALUES (${tenant.id}, '演示科技有限公司')
    RETURNING id
  `
  console.log('  ✓ 公司: 演示科技有限公司')

  // ── 部门 ────────────────────────────────────────────
  const [generalDept] = await sql`
    INSERT INTO departments (company_id, name, is_dm)
    VALUES (${company.id}, '技术部', false)
    RETURNING id
  `
  // 添加成员到部门
  await sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES
      (${generalDept.id}, ${adminAgent.id}, 'admin'),
      (${generalDept.id}, ${userAgent.id}, 'member'),
      (${generalDept.id}, ${aiAgent.id}, 'member')
  `
  console.log('  ✓ 部门: 技术部（3 名成员）')

  // ── 演示消息 ────────────────────────────────────────
  await sql`
    INSERT INTO messages (department_id, sender_id, content, msg_type, created_at)
    VALUES
      (${generalDept.id}, ${userAgent.id}, '你好！小悟在吗？', 'text', NOW() - INTERVAL '10 minutes'),
      (${generalDept.id}, ${aiAgent.id}, '在的！有什么可以帮助你的？', 'text', NOW() - INTERVAL '9 minutes'),
      (${generalDept.id}, ${userAgent.id}, '帮我写一个简单的 Node.js HTTP 服务器', 'text', NOW() - INTERVAL '8 minutes'),
      (${generalDept.id}, ${aiAgent.id}, '''javascript
const http = require("http");
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Hello World\\n");
});
server.listen(3000);
```', 'text', NOW() - INTERVAL '7 minutes')
  `
  console.log('  ✓ 演示消息: 4 条')

  await pg.close()
  console.log('\n[seed] ✅ 完成！')
  console.log('\n  管理员: admin@demo.com / admin123')
  console.log('  用户:   user@demo.com / user123')
  console.log('\n  启动: cd apps/agent-platform && npm start\n')
}

main().catch((err) => {
  console.error('[seed] 失败:', err)
  process.exit(1)
})
