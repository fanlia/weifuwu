#!/usr/bin/env node
/**
 * 种子数据脚本 — 可重复执行，每次先清空数据再重新创建
 *
 * 用法: node --env-file=.env scripts/seed.mjs
 *
 * 创建完整演示环境，让用户能完整体验：
 *   - 9 种角色模板中选 3 种创建 Agent（开发助手、智能客服、运维机器人）
 *   - 技能自动绑定到 AI Agent
 *   - 工作空间配置演示
 *   - 多个部门 + 成员 + 消息历史
 *   - Dashboard 统计面板有数据
 *
 * 登录凭据:
 *   管理员: admin@demo.com / admin123
 *   用户:   user@demo.com / user123
 */

import { postgres } from 'weifuwu'
import { hashPassword } from '../src/services/password.ts'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 内置技能目录路径 */
const BUILTIN_SKILLS_DIR = resolve(__dirname, '..', 'skills', 'builtin')

/** 预置角色模板定义 */
const ROLE_TEMPLATES = [
  {
    slug: 'developer',
    name: '开发助手',
    icon: '👨‍💻',
    default_system_prompt: '你是一个资深软件开发工程师。帮助分析代码、编写代码、调试问题。仅在用户提出相关需求时才主动探索项目结构。回答简单问题时保持简洁，避免不必要的额外操作。',
    default_temperature: 0.7,
    default_max_tokens: 4096,
    default_allow_file_tools: true,
    default_allow_command_exec: true,
    default_workspace_hint: '/data/projects/demo',
    default_skills: ['search-knowledge-base', 'get-current-time'],
  },
  {
    slug: 'customer-support',
    name: '智能客服',
    icon: '🎧',
    default_system_prompt: '你是一个专业的客服助手。根据知识库准确回答用户问题。如果无法确定，请礼貌地转接人工客服。',
    default_temperature: 0.5,
    default_max_tokens: 2048,
    default_allow_file_tools: false,
    default_allow_command_exec: false,
    default_workspace_hint: null,
    default_skills: ['search-knowledge-base'],
  },
  {
    slug: 'ops-bot',
    name: '运维机器人',
    icon: '🔧',
    default_system_prompt: '你是运维工程师。响应告警、排查故障、执行维护操作。高危操作（rm、drop、deploy 等）需要人工审批。所有操作记录日志。',
    default_temperature: 0.3,
    default_max_tokens: 4096,
    default_allow_file_tools: true,
    default_allow_command_exec: true,
    default_workspace_hint: '/data/ops/scripts',
    default_skills: ['search-knowledge-base', 'get-current-time'],
  },
]

async function main() {
  console.log('[seed] 开始初始化演示数据...\n')

  const pg = postgres()
  const { sql } = pg

  // ── 清空业务数据（保留租户和用户 UUID 不变） ────────
  console.log('  … 清空业务数据...')
  await sql.unsafe(`
    DELETE FROM webhook_logs;
    DELETE FROM agent_logs;
    DELETE FROM kb_chunks;
    DELETE FROM kb_documents;
    DELETE FROM agent_skills;
    DELETE FROM messages;
    DELETE FROM department_members;
    DELETE FROM departments;
    DELETE FROM agents;
    DELETE FROM companies;
  `)
  console.log('  ✓ 已清空业务数据')

  // ── 确保 schema 存在 ─────────────────────────────────
  console.log('  … 确保 schema...')
  const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.sql')
  await sql.unsafe(readFileSync(schemaPath, 'utf-8'))
  console.log('  ✓ schema')

  // ════════════════════════════════════════════════════
  // 1. 租户 + 用户
  // ════════════════════════════════════════════════════

  // 使用固定 UUID 确保 re-seed 后租户 ID 永远不变
  // token 中的 tenantId 始终有效，无需重新登录
  const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001'
  const [tenant] = await sql`
    INSERT INTO tenants (id, name, slug)
    VALUES (${DEMO_TENANT_ID}, '演示科技有限公司', 'demo')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug
    RETURNING id
  `
  console.log('  ✓ 租户: 演示科技有限公司')

  // 注意：认证已迁移到 weifuwu 框架 user()（_weifuwu_users 表，scrypt$ 哈希格式，
  // tenant claim 进 token）。seed 必须写入框架用户表，否则登录后 tenantId 与业务数据
  // 不匹配（历史 bug：写旧 users 表 → 登录成功但 Dashboard 全 0）。
  const adminPassword = await hashPassword('admin123')
  const [admin] = await sql`
    INSERT INTO _weifuwu_users (email, name, password_hash, role, tenant)
    VALUES ('admin@demo.com', '张明', ${adminPassword}, 'admin', ${tenant.id})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, tenant = EXCLUDED.tenant
    RETURNING id, name
  `
  console.log('  ✓ 管理员: admin@demo.com / admin123')

  const userPassword = await hashPassword('user123')
  const [user] = await sql`
    INSERT INTO _weifuwu_users (email, name, password_hash, role, tenant)
    VALUES ('user@demo.com', '李华', ${userPassword}, 'member', ${tenant.id})
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, tenant = EXCLUDED.tenant
    RETURNING id, name
  `
  console.log('  ✓ 用户: user@demo.com / user123')

  // ════════════════════════════════════════════════════
  // 2. Agent — 真实用户映射
  // ════════════════════════════════════════════════════

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
  console.log('  ✓ 用户 Agent: 张明, 李华')

  // ════════════════════════════════════════════════════
  // 3. Agent — 从角色模板创建 AI 机器人
  // ════════════════════════════════════════════════════

  // 3a. 开发助手（带工作空间 + 文件工具 + bash）
  const devTemplate = ROLE_TEMPLATES.find(t => t.slug === 'developer')
  const [devAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, model,
      system_prompt, temperature, max_tokens,
      allow_file_tools, allow_command_exec,
      is_active, tools)
    VALUES (${tenant.id}, 'ai', '小码', '代码编写与项目重构助手',
      'deepseek-v4-flash',
      ${devTemplate.default_system_prompt},
      ${devTemplate.default_temperature},
      ${devTemplate.default_max_tokens},
      ${devTemplate.default_allow_file_tools},
      ${devTemplate.default_allow_command_exec},
      true, '[]')
    RETURNING id
  `
  // 绑定技能
  for (const skillName of devTemplate.default_skills) {
    const skillDir = resolve(BUILTIN_SKILLS_DIR, skillName)
    if (existsSync(resolve(skillDir, 'SKILL.md'))) {
      await sql`
        INSERT INTO agent_skills (agent_id, skill_name, skill_dir, enabled)
        VALUES (${devAgent.id}, ${skillName}, ${skillDir}, true)
      `
    }
  }
  console.log(`  ✓ AI Agent: 小码（开发助手模板）${devTemplate.default_skills.length} 个技能已绑定`)

  // 3b. 智能客服（带知识库 + HITL）
  const csTemplate = ROLE_TEMPLATES.find(t => t.slug === 'customer-support')
  const [csAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, model,
      system_prompt, temperature, max_tokens,
      human_in_the_loop, is_active, tools)
    VALUES (${tenant.id}, 'ai', '小应', '客户服务与 FAQ 自动回复',
      'deepseek-v4-flash',
      ${csTemplate.default_system_prompt},
      ${csTemplate.default_temperature},
      ${csTemplate.default_max_tokens},
      true, true, '[]')
    RETURNING id
  `
  for (const skillName of csTemplate.default_skills) {
    const skillDir = resolve(BUILTIN_SKILLS_DIR, skillName)
    if (existsSync(resolve(skillDir, 'SKILL.md'))) {
      await sql`
        INSERT INTO agent_skills (agent_id, skill_name, skill_dir, enabled)
        VALUES (${csAgent.id}, ${skillName}, ${skillDir}, true)
      `
    }
  }
  console.log('  ✓ AI Agent: 小应（智能客服模板 + HITL）')

  // 3c. 运维机器人（带工作空间 + bash + HITL）
  const opsTemplate = ROLE_TEMPLATES.find(t => t.slug === 'ops-bot')
  const [opsAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, model,
      system_prompt, temperature, max_tokens,
      allow_file_tools, allow_command_exec,
      human_in_the_loop, is_active, tools)
    VALUES (${tenant.id}, 'ai', '小维', '系统监控与自动化运维',
      'deepseek-v4-flash',
      ${opsTemplate.default_system_prompt},
      ${opsTemplate.default_temperature},
      ${opsTemplate.default_max_tokens},
      ${opsTemplate.default_allow_file_tools},
      ${opsTemplate.default_allow_command_exec},
      true, true, '[]')
    RETURNING id
  `
  for (const skillName of opsTemplate.default_skills) {
    const skillDir = resolve(BUILTIN_SKILLS_DIR, skillName)
    if (existsSync(resolve(skillDir, 'SKILL.md'))) {
      await sql`
        INSERT INTO agent_skills (agent_id, skill_name, skill_dir, enabled)
        VALUES (${opsAgent.id}, ${skillName}, ${skillDir}, true)
      `
    }
  }
  console.log('  ✓ AI Agent: 小维（运维机器人模板 + HITL + 工作空间）')

  // 3d. 通用助手（无特殊权限）
  const [generalAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, model,
      system_prompt, temperature, max_tokens, is_active, tools)
    VALUES (${tenant.id}, 'ai', '小悟', '通用问答助手',
      'deepseek-v4-flash',
      '你是一个有帮助的 AI 助手，名叫小悟。回答简洁、准确、友好。',
      0.7, 2048, true, '[]')
    RETURNING id
  `
  console.log('  ✓ AI Agent: 小悟（通用助手）')

  // ════════════════════════════════════════════════════
  // 4. Agent — 知识库
  // ════════════════════════════════════════════════════

  const [kbAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, chunk_size, chunk_overlap, is_active)
    VALUES (${tenant.id}, 'knowledge_base', '产品知识库', '产品手册与 FAQ 文档库', 500, 50, true)
    RETURNING id
  `

  // 文档 1: 产品介绍
  const doc1Content = `# Agent Platform 产品介绍

Agent Platform 是一个多租户 AI Agent 平台，基于 weifuwu 框架构建。

## 核心特性

1. **四种 Agent 类型**：AI 机器人、Webhook、知识库、真实用户
2. **多租户隔离**：每个租户的数据完全隔离
3. **Human-in-the-Loop**：AI 回复可配置为需要人工审批
4. **工具调用**：AI 机器人可通过 tool calling 执行外部操作
5. **技能系统**：通过 SKILL.md 扩展 AI 能力

## 支持的模型

- DeepSeek Chat（默认）
- DeepSeek Reasoner
- DeepSeek V4 Flash

## 系统架构

前端使用 weifuwu/client 信号驱动 UI，后端使用 weifuwu Router + Postgres + 可选的 Redis。`
  const [doc1] = await sql`
    INSERT INTO kb_documents (agent_id, filename, content, chunk_count)
    VALUES (${kbAgent.id}, '产品介绍.md', ${doc1Content}, 2)
    RETURNING id
  `
  // 模拟向量（随机 1024 维）
  function randomVec() {
    return '[' + Array.from({ length: 1024 }, () => (Math.random() * 2 - 1).toFixed(6)).join(',') + ']'
  }
  await sql`
    INSERT INTO kb_chunks (document_id, agent_id, content, chunk_index, embedding)
    VALUES (${doc1.id}, ${kbAgent.id}, ${doc1Content.slice(0, 300)}, 0, ${randomVec()}::vector)
  `
  await sql`
    INSERT INTO kb_chunks (document_id, agent_id, content, chunk_index, embedding)
    VALUES (${doc1.id}, ${kbAgent.id}, ${doc1Content.slice(300)}, 1, ${randomVec()}::vector)
  `

  // 文档 2: FAQ
  const doc2Content = `# 常见问题 (FAQ)

## 如何创建 AI 机器人？
1. 进入 Agent 页面，点击"创建 Agent"
2. 选择一个角色模板（如"开发助手"）
3. 填写名称，根据需求调整系统提示词
4. 提交创建

## 如何配置知识库？
1. 创建一个 knowledge_base 类型的 Agent
2. 在详情页上传文档（支持 .txt / .md / .csv / .json）
3. 系统自动分块并生成向量索引

## 如何启用 HITL？
在创建或编辑 Agent 时，开启"人工审批"开关。开启后 AI 的每条回复都会生成草稿，需要管理员批准后才发送。`
  const [doc2] = await sql`
    INSERT INTO kb_documents (agent_id, filename, content, chunk_count)
    VALUES (${kbAgent.id}, 'FAQ.md', ${doc2Content}, 2)
    RETURNING id
  `
  await sql`
    INSERT INTO kb_chunks (document_id, agent_id, content, chunk_index, embedding)
    VALUES (${doc2.id}, ${kbAgent.id}, ${doc2Content.slice(0, 250)}, 0, ${randomVec()}::vector)
  `
  await sql`
    INSERT INTO kb_chunks (document_id, agent_id, content, chunk_index, embedding)
    VALUES (${doc2.id}, ${kbAgent.id}, ${doc2Content.slice(250)}, 1, ${randomVec()}::vector)
  `
  console.log('  ✓ 知识库 Agent: 产品知识库（含 2 篇文档 4 个分块）')

  // ════════════════════════════════════════════════════
  // 5. Agent — Webhook
  // ════════════════════════════════════════════════════

  const [webhookAgent] = await sql`
    INSERT INTO agents (tenant_id, type, name, description, webhook_url, webhook_secret, webhook_retry_count, is_active)
    VALUES (${tenant.id}, 'webhook', '通知机器人', '接收外部系统回调通知',
      'https://hooks.example.com/notify', 'sk-demo-webhook-secret', 3, true)
    RETURNING id
  `
  console.log('  ✓ Webhook Agent: 通知机器人')

  // ════════════════════════════════════════════════════
  // 6. 公司 + 部门
  // ════════════════════════════════════════════════════

  const [company] = await sql`
    INSERT INTO companies (tenant_id, name)
    VALUES (${tenant.id}, '演示科技有限公司')
    RETURNING id
  `

  // 部门 1: 技术部（开发 + 全员）
  const [devDept] = await sql`
    INSERT INTO departments (company_id, name, is_dm)
    VALUES (${company.id}, '技术部', false)
    RETURNING id
  `
  await sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES
      (${devDept.id}, ${adminAgent.id}, 'admin'),
      (${devDept.id}, ${userAgent.id}, 'member'),
      (${devDept.id}, ${devAgent.id}, 'member'),
      (${devDept.id}, ${generalAgent.id}, 'member')
  `

  // 部门 2: 客服中心（智能客服 + 知识库）
  const [csDept] = await sql`
    INSERT INTO departments (company_id, name, is_dm)
    VALUES (${company.id}, '客服中心', false)
    RETURNING id
  `
  await sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES
      (${csDept.id}, ${adminAgent.id}, 'admin'),
      (${csDept.id}, ${csAgent.id}, 'member'),
      (${csDept.id}, ${kbAgent.id}, 'member')
  `

  // 部门 3: 运维组（运维机器人 + HITL）
  const [opsDept] = await sql`
    INSERT INTO departments (company_id, name, is_dm)
    VALUES (${company.id}, '运维组', false)
    RETURNING id
  `
  await sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES
      (${opsDept.id}, ${adminAgent.id}, 'admin'),
      (${opsDept.id}, ${opsAgent.id}, 'member'),
      (${opsDept.id}, ${webhookAgent.id}, 'member')
  `

  // 部门 4: 单聊 — 张明和小码的 DM
  const [dmDept] = await sql`
    INSERT INTO departments (company_id, name, is_dm)
    VALUES (${company.id}, '张明 — 小码', true)
    RETURNING id
  `
  await sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES
      (${dmDept.id}, ${adminAgent.id}, 'admin'),
      (${dmDept.id}, ${devAgent.id}, 'member')
  `

  console.log('  ✓ 4 个部门: 技术部 / 客服中心 / 运维组 / 张明-小码')

  // ════════════════════════════════════════════════════
  // 7. 消息历史
  // ════════════════════════════════════════════════════

  await sql`
    INSERT INTO messages (department_id, sender_id, content, msg_type, created_at)
    VALUES
      -- 技术部对话
      (${devDept.id}, ${userAgent.id}, '小码，帮我看一下这段代码有什么问题？\n\`\`\`typescript\nconst data = await fetch("/api/users")\nreturn data\n\`\`\`', 'text', NOW() - INTERVAL '30 minutes'),
      (${devDept.id}, ${devAgent.id}, '这段代码有几个问题：\n\n1. **缺少错误处理** — fetch 可能失败，需要用 try-catch\n2. **没有解析 JSON** — data 是 Response 对象，需要调用 data.json()\n3. **缺少类型定义** — 建议给返回值加类型\n\n改进建议：\n\`\`\`typescript\ninterface User { id: string; name: string; email: string }\n\nasync function getUsers(): Promise<User[]> {\n  try {\n    const res = await fetch("/api/users")\n    if (!res.ok) throw new Error(HTTP \${res.status})\n    return res.json()\n  } catch (err) {\n    console.error("获取用户列表失败:", err)\n    return []\n  }\n}\n\`\`\`', 'text', NOW() - INTERVAL '28 minutes'),
      (${devDept.id}, ${userAgent.id}, '明白了，谢谢！能帮我跑一下测试吗？', 'text', NOW() - INTERVAL '25 minutes'),
      (${devDept.id}, ${devAgent.id}, '⚠️ 需要先设置工作空间路径才能运行测试命令。请在工作空间配置中设置项目根目录路径。', 'text', NOW() - INTERVAL '23 minutes'),

      -- 客服中心对话
      (${csDept.id}, ${userAgent.id}, '请问如何创建一个 AI 机器人？', 'text', NOW() - INTERVAL '20 minutes'),
      (${csDept.id}, ${csAgent.id}, '您好！创建 AI 机器人的步骤如下：\n\n1. 进入 **Agent** 页面，点击"创建 Agent"\n2. 选择一个角色模板（如"开发助手"或"智能客服"）\n3. 填写名称，调整系统提示词\n4. 点击提交即可\n\n更详细的说明可以参考我们的知识库文档。', 'text', NOW() - INTERVAL '18 minutes'),
      (${csDept.id}, ${userAgent.id}, '好的，再问一下怎么配置 HITL？', 'text', NOW() - INTERVAL '15 minutes'),
      (${csDept.id}, ${csAgent.id}, 'HITL 配置很简单：\n\n1. 在创建或编辑 AI 机器人时，找到「人工审批」开关\n2. 开启后，AI 的回复不会直接发送，而是生成草稿\n3. 管理员在聊天界面会看到审批按钮，可以批准或拒绝\n\n这样可以确保敏感场景下的回复质量。还有其他问题吗？', 'text', NOW() - INTERVAL '13 minutes'),

      -- 运维组对话
      (${opsDept.id}, ${adminAgent.id}, '小维，收到一条告警：服务器 CPU 负载超过 90%', 'text', NOW() - INTERVAL '10 minutes'),
      (${opsDept.id}, ${opsAgent.id}, '⚠️ **收到告警，正在诊断**\n\n请确认以下信息：\n1. 哪个服务器？\n2. 持续了多久？\n3. 最近是否有新部署？\n\n请在工作空间配置中设置运维脚本目录，我可以执行诊断脚本。', 'text', NOW() - INTERVAL '8 minutes'),

      -- 张明-小码 单聊
      (${dmDept.id}, ${adminAgent.id}, '小码，帮我写一个 git hook 脚本，在 commit 前自动运行 lint', 'text', NOW() - INTERVAL '5 minutes'),
      (${dmDept.id}, ${devAgent.id}, '这是一个 pre-commit hook 脚本：\n\n\`\`\`bash\n#!/bin/bash\n# .git/hooks/pre-commit\n\n# 运行 ESLint\necho "Running ESLint..."\nnpx eslint . --ext .ts,.tsx\nif [ $? -ne 0 ]; then\n  echo "❌ ESLint 检查未通过，请修复后重新提交"\n  exit 1\nfi\n\n# 运行类型检查\necho "Running Type Check..."\nnpx tsc --noEmit\nif [ $? -ne 0 ]; then\n  echo "❌ 类型检查未通过，请修复后重新提交"\n  exit 1\nfi\n\necho "✅ 所有检查通过"\n\`\`\`\n\n安装方式：\n\`\`\`bash\nchmod +x .git/hooks/pre-commit\n\`\`\`', 'text', NOW() - INTERVAL '3 minutes')
  `
  console.log('  ✓ 消息历史: 10 条（覆盖 4 个部门）')

  // ════════════════════════════════════════════════════
  // 8. Agent 执行日志（Dashboard 面板数据）
  // ════════════════════════════════════════════════════

  await sql`
    INSERT INTO agent_logs (agent_id, tenant_id, department_id, messages_count, steps_count, tokens_prompt, tokens_completion, tokens_total, elapsed_ms, success, created_at)
    VALUES
      -- 小码执行记录
      (${devAgent.id}, ${tenant.id}, ${devDept.id}, 10, 2, 850, 420, 1270, 3200, true, NOW() - INTERVAL '29 minutes'),
      (${devAgent.id}, ${tenant.id}, ${devDept.id}, 15, 3, 1200, 680, 1880, 5100, true, NOW() - INTERVAL '24 minutes'),
      (${devAgent.id}, ${tenant.id}, ${dmDept.id}, 5, 1, 340, 180, 520, 1800, true, NOW() - INTERVAL '4 minutes'),
      -- 小应执行记录
      (${csAgent.id}, ${tenant.id}, ${csDept.id}, 8, 1, 560, 210, 770, 2400, true, NOW() - INTERVAL '19 minutes'),
      (${csAgent.id}, ${tenant.id}, ${csDept.id}, 12, 1, 780, 340, 1120, 3100, true, NOW() - INTERVAL '14 minutes'),
      -- 小维执行记录（有一次失败）
      (${opsAgent.id}, ${tenant.id}, ${opsDept.id}, 6, 3, 980, 560, 1540, 4500, true, NOW() - INTERVAL '9 minutes'),
      (${opsAgent.id}, ${tenant.id}, ${opsDept.id}, 3, 2, 420, 0, 420, 12000, false, NOW() - INTERVAL '7 minutes')
  `
  console.log('  ✓ Agent 执行日志: 7 条（含 1 条失败记录）')

  // ════════════════════════════════════════════════════
  // 9. Webhook 调用日志
  // ════════════════════════════════════════════════════

  await sql`
    INSERT INTO webhook_logs (agent_id, tenant_id, request_body, response_body, response_status, elapsed_ms, success, created_at)
    VALUES
      (${webhookAgent.id}, ${tenant.id}, '{"event":"deploy","status":"success"}', '{"reply":"部署成功通知已收到"}', 200, 1200, true, NOW() - INTERVAL '1 hour'),
      (${webhookAgent.id}, ${tenant.id}, '{"event":"monitor","alert":"cpu_high"}', '{"reply":"告警已记录，已通知运维组"}', 200, 980, true, NOW() - INTERVAL '30 minutes'),
      (${webhookAgent.id}, ${tenant.id}, '{"event":"deploy","status":"failed"}', '{"reply":"部署失败通知已收到"}', 200, 1500, true, NOW() - INTERVAL '15 minutes')
  `
  console.log('  ✓ Webhook 调用日志: 3 条')

  // ════════════════════════════════════════════════════
  // 10. 创建工作空间演示文件
  // ════════════════════════════════════════════════════

  // 为有文件工具的 Agent 创建演示目录和文件
  const workspaceRoot = process.env.AGENT_WORKSPACE_ROOT
    ? resolve(process.env.AGENT_WORKSPACE_ROOT)
    : resolve(__dirname, '..', 'data', 'workspaces')

  const mkdir = (await import('node:fs/promises')).mkdir
  const writeFile = (await import('node:fs/promises')).writeFile

  for (const agentRow of [devAgent, opsAgent]) {
    const dir = join(workspaceRoot, agentRow.id)
    await mkdir(dir, { recursive: true })
  }

  // 开发助手的工作空间：写一个 demo 文件
  const devWorkspace = join(workspaceRoot, devAgent.id)
  await writeFile(join(devWorkspace, 'README.md'), `# Demo Project

这是一个演示项目，用于测试 AI Agent 的文件操作能力。

## 目录结构

- \`src/\` — 源代码
- \`tests/\` — 测试文件
- \`README.md\` — 本文件
`)
  await mkdir(join(devWorkspace, 'src'), { recursive: true })
  await writeFile(join(devWorkspace, 'src', 'index.ts'), `// 入口文件
console.log("Hello, Agent!")
`)
  await writeFile(join(devWorkspace, 'src', 'utils.ts'), `// 工具函数
export function add(a: number, b: number): number {
  return a + b
}
`)
  console.log('  ✓ 工作空间演示文件已创建')

  await pg.close()

  // ════════════════════════════════════════════════════
  // 10. 完成 — 打印摘要
  // ════════════════════════════════════════════════════

  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║            🎉 种子数据创建完成                       ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log()
  console.log('  📧 登录凭据')
  console.log('    管理员: admin@demo.com / admin123')
  console.log('    用户:   user@demo.com / user123')
  console.log()
  console.log('  🤖 AI Agent（从角色模板创建）')
  console.log('    👨‍💻 小码 — 开发助手（文件工具 + bash + 2技能）')
  console.log('    🎧  小应 — 智能客服（HITL审批 + 知识库检索）')
  console.log('    🔧  小维 — 运维机器人（HITL + 文件 + bash + 2技能）')
  console.log('    🤖  小悟 — 通用助手')
  console.log()
  console.log('  📚 知识库: 产品知识库（2篇文档）')
  console.log('  🔗 Webhook: 通知机器人')
  console.log()
  console.log('  👥 部门（4个）')
  console.log('    技术部 — 张明、李华、小码、小悟')
  console.log('    客服中心 — 张明、小应、产品知识库')
  console.log('    运维组 — 张明、小维、通知机器人')
  console.log('    张明-小码 — 单聊')
  console.log()
  console.log('  📊 Dashboard 数据')
  console.log('    4 个 Agent · 7 条执行日志 · 10 条消息 · 3 条 Webhook 日志')
  console.log()
  console.log('  💡 建议体验顺序')
  console.log('    1. 浏览器打开 http://localhost:3000')
  console.log('    2. 用 admin@demo.com / admin123 登录')
  console.log('    3. 查看 Dashboard 统计数据')
  console.log('    4. 进入 Agent 页面，查看各 Agent 详情')
  console.log('    5. 在 Agent 详情中体验技能管理、工作空间配置')
  console.log('    6. 进入"技术部"聊天，与 AI Agent 对话')
  console.log('    7. 尝试创建新的 Agent，体验角色模板选择')
}

main().catch((err) => {
  console.error('[seed] 失败:', err)
  process.exit(1)
})
