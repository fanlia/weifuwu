#!/usr/bin/env node
/**
 * 种子数据脚本 — 可重复执行，每次先清空数据再重新创建
 *
 * 用法: node --env-file=.env scripts/seed.mjs
 *
 * 创建的数据：
 *   管理员: admin@demo.com / admin123
 *   普通用户: user@demo.com / user123
 *   AI Agent: 小悟助手（已加入技术部）
 *   Webhook Agent: 通知机器人（外部回调示例）
 *   知识库 Agent: 产品文档库（含一篇测试文档）
 *   部门: 技术部（3 位成员）+ 消息历史
 */

import { postgres } from 'weifuwu'
import { hashPassword } from '../src/services/password.ts'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  console.log('[seed] 开始初始化演示数据...\n')

  const pg = postgres()
  const { sql } = pg

  // ── 清空已有数据（保留 schema） ──────────────────────
  console.log('  … 清空已有数据...')
  await sql.unsafe(`
    DELETE FROM webhook_logs;
    DELETE FROM agent_logs;
    DELETE FROM kb_chunks;
    DELETE FROM kb_documents;
    DELETE FROM messages;
    DELETE FROM department_members;
    DELETE FROM departments;
    DELETE FROM agents;
    DELETE FROM companies;
    DELETE FROM users;
    DELETE FROM tenants;
  `)
  console.log('  ✓ 已清空')

  // ── 确保 schema 存在 ─────────────────────────────────
  console.log('  … 确保 schema...')
  const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.sql')
  await sql.unsafe(readFileSync(schemaPath, 'utf-8'))
  console.log('  ✓ schema')

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

  // ── Agent: 真实用户映射 ─────────────────────────────
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

  // ── Agent: AI 机器人 ────────────────────────────────
  const [aiAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, model, system_prompt, temperature, max_tokens, human_in_the_loop, is_active)
    VALUES (${tenant.id}, 'ai', '小悟助手', '通用 AI 助手，回答各类问题', 'deepseek-chat', '你是一个有帮助的 AI 助手，名叫小悟。回答简洁、准确、友好。', 0.7, 2048, false, true)
    RETURNING id
  `
  console.log('  ✓ AI Agent: 小悟助手')

  // ── Agent: 知识库 ────────────────────────────────────
  const [kbAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, chunk_size, chunk_overlap, is_active)
    VALUES (${tenant.id}, 'knowledge_base', '产品文档库', '存储产品手册和 FAQ', 500, 50, true)
    RETURNING id
  `
  // 知识库文档 + 随机向量
  const kbContent = 'Agent Platform 是一个多租户 AI Agent 平台，支持四种类型的 Agent：AI 机器人、Webhook、知识库和真实用户。'
  const [kbDoc] = await sql`
    INSERT INTO kb_documents (agent_id, filename, content, chunk_count)
    VALUES (${kbAgent.id}, '产品介绍.md', ${kbContent}, 1)
    RETURNING id
  `
  const mockVec = '[' + Array.from({ length: 1024 }, () => (Math.random() * 2 - 1).toFixed(6)).join(',') + ']'
  await sql`
    INSERT INTO kb_chunks (document_id, agent_id, content, chunk_index, embedding)
    VALUES (${kbDoc.id}, ${kbAgent.id}, ${kbContent}, 0, ${mockVec}::vector)
  `
  console.log('  ✓ 知识库 Agent: 产品文档库（含 1 篇文档）')

  // ── Agent: Webhook ──────────────────────────────────
  const [webhookAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, webhook_url, webhook_secret, is_active)
    VALUES (${tenant.id}, 'webhook', '通知机器人', '接收外部 Webhook 回调并回复', 'https://example.com/webhook', 'test-secret-123', true)
    RETURNING id
  `
  console.log('  ✓ Webhook Agent: 通知机器人')

  // ── 公司 ────────────────────────────────────────────
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
  await sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES
      (${generalDept.id}, ${adminAgent.id}, 'admin'),
      (${generalDept.id}, ${userAgent.id}, 'member'),
      (${generalDept.id}, ${aiAgent.id}, 'member'),
      (${generalDept.id}, ${kbAgent.id}, 'member'),
      (${generalDept.id}, ${webhookAgent.id}, 'member')
  `
  console.log('  ✓ 部门: 技术部（5 位成员）')

  // ── 演示消息 ────────────────────────────────────────
  const codeExample = '```javascript\nconst http = require("http");\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { "Content-Type": "text/plain" });\n  res.end("Hello World\\n");\n});\nserver.listen(3000);\n```'
  await sql`
    INSERT INTO messages (department_id, sender_id, content, msg_type, created_at)
    VALUES
      (${generalDept.id}, ${userAgent.id}, '你好！小悟在吗？', 'text', NOW() - INTERVAL '10 minutes'),
      (${generalDept.id}, ${aiAgent.id}, '在的！有什么可以帮助你的？', 'text', NOW() - INTERVAL '9 minutes'),
      (${generalDept.id}, ${userAgent.id}, '帮我写一个简单的 Node.js HTTP 服务器', 'text', NOW() - INTERVAL '8 minutes'),
      (${generalDept.id}, ${aiAgent.id}, ${codeExample}, 'text', NOW() - INTERVAL '7 minutes')
  `
  console.log('  ✓ 演示消息: 4 条')

  await pg.close()
  console.log('\n[seed] ✅ 完成！')
  console.log()
  console.log('  管理员:    admin@demo.com / admin123')
  console.log('  用户:      user@demo.com / user123')
  console.log()
  console.log('  Agent 类型:')
  console.log('    AI 机器人     → 小悟助手（技术部成员）')
  console.log('    知识库       → 产品文档库（含 1 篇文档）')
  console.log('    Webhook      → 通知机器人（含 secret 配置）')
  console.log('    真实用户     → 管理员、演示用户')
  console.log()
  console.log('  技术部: 5 位成员 + 4 条历史消息')
}

main().catch((err) => {
  console.error('[seed] 失败:', err)
  process.exit(1)
})
