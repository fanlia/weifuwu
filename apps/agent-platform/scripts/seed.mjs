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

import { postgres, hashPassword } from 'weifuwu'
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
    default_skills: ['search-knowledge-base', 'get-current-time', 'process-csv', 'fetch-url'],
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
    default_skills: ['search-knowledge-base', 'get-current-time', 'fetch-url'],
  },
]

async function main() {
  console.log('[seed] 开始初始化演示数据...\n')

  const pg = postgres()
  const { sql } = pg

  // ── 清空业务数据（保留应用和用户 UUID 不变） ────────
  console.log('  … 清空业务数据...')
  await sql.unsafe(`
    DELETE FROM webhook_logs;
    DELETE FROM agent_logs;
    DELETE FROM kb_chunks;
    DELETE FROM kb_documents;
    DELETE FROM agent_skills;
    DELETE FROM messages;
    DELETE FROM department_members;
    DELETE FROM sandboxes;
    DELETE FROM departments;
    DELETE FROM agents;
  `)
  console.log('  ✓ 已清空业务数据')

  // ── 确保 schema 存在 ─────────────────────────────────
  console.log('  … 确保 schema...')
  const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.sql')
  await sql.unsafe(readFileSync(schemaPath, 'utf-8'))
  console.log('  ✓ schema')

  // ════════════════════════════════════════════════════
  // 1. 应用 + 用户（框架 userSystem 三层模型）
  // ════════════════════════════════════════════════════

  // 使用固定 UUID 确保 re-seed 后 app ID 永远不变
  // 应用 token 中的 appId 始终有效，无需重新登录
  const DEMO_APP_ID = '00000000-0000-0000-0000-000000000001'
  const adminPassword = await hashPassword('admin123')
  const [admin] = await sql`
    INSERT INTO _weifuwu_users (email, name, password_hash, role)
    VALUES ('admin@demo.com', '张明', ${adminPassword}, 'admin')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
    RETURNING id, name
  `
  console.log('  ✓ 管理员: admin@demo.com / admin123')

  const userPassword = await hashPassword('user123')
  const [user] = await sql`
    INSERT INTO _weifuwu_users (email, name, password_hash, role)
    VALUES ('user@demo.com', '李华', ${userPassword}, 'member')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
    RETURNING id, name
  `
  console.log('  ✓ 用户: user@demo.com / user123')

  // 应用（= 产品/公司——一个 app 就是一个公司）
  await sql`
    INSERT INTO _weifuwu_apps (id, slug, name, owner_user_id, sandbox_quota)
    VALUES (${DEMO_APP_ID}, 'demo', '演示科技有限公司', ${admin.id}, 20)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, owner_user_id = EXCLUDED.owner_user_id, sandbox_quota = 20
  `
  // 成员关系（owner + member）
  await sql`
    INSERT INTO _weifuwu_app_members (app_id, user_id, role, invited_by)
    VALUES
      (${DEMO_APP_ID}, ${admin.id}, 'owner', ${admin.id}),
      (${DEMO_APP_ID}, ${user.id}, 'member', ${admin.id})
    ON CONFLICT DO NOTHING
  `
  console.log('  ✓ 应用: 演示科技有限公司（demo）')

  // ════════════════════════════════════════════════════
  // 2. Agent — 真实用户映射
  // ════════════════════════════════════════════════════

  const [adminAgent] = await sql`
    INSERT INTO agents (app_id, type, name, user_id, is_active)
    VALUES (${DEMO_APP_ID}, 'user', ${admin.name}, ${admin.id}, true)
    RETURNING id
  `
  const [userAgent] = await sql`
    INSERT INTO agents (app_id, type, name, user_id, is_active)
    VALUES (${DEMO_APP_ID}, 'user', ${user.name}, ${user.id}, true)
    RETURNING id
  `
  console.log('  ✓ 用户 Agent: 张明, 李华')

  // ════════════════════════════════════════════════════
  // 3. Agent — 从角色模板创建 AI 机器人
  // ════════════════════════════════════════════════════

  // 3a. 开发助手（带工作空间 + 文件工具 + bash）
  const devTemplate = ROLE_TEMPLATES.find(t => t.slug === 'developer')
  const [devAgent] = await sql`
    INSERT INTO agents (app_id, type, name, description, model,
      system_prompt, temperature, max_tokens,
      allow_file_tools, allow_command_exec,
      is_active, tools)
    VALUES (${DEMO_APP_ID}, 'ai', '小码', '代码编写与项目重构助手',
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
    INSERT INTO agents (app_id, type, name, description, model,
      system_prompt, temperature, max_tokens,
      human_in_the_loop, is_active, tools)
    VALUES (${DEMO_APP_ID}, 'ai', '小应', '客户服务与 FAQ 自动回复',
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
    INSERT INTO agents (app_id, type, name, description, model,
      system_prompt, temperature, max_tokens,
      allow_file_tools, allow_command_exec,
      human_in_the_loop, is_active, tools)
    VALUES (${DEMO_APP_ID}, 'ai', '小维', '系统监控与自动化运维',
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
    INSERT INTO agents (app_id, type, name, description, model,
      system_prompt, temperature, max_tokens, is_active, tools)
    VALUES (${DEMO_APP_ID}, 'ai', '小悟', '通用问答助手',
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
    INSERT INTO agents (app_id, type, name, description, chunk_size, chunk_overlap, is_active)
    VALUES (${DEMO_APP_ID}, 'knowledge_base', '产品知识库', '产品手册与 FAQ 文档库', 500, 50, true)
    RETURNING id
  `

  // 文档 1: 产品介绍
  const doc1Content = `# Agent Platform 产品介绍

Agent Platform 是一个 AI Agent 平台，基于 weifuwu 框架构建。

## 核心特性

1. **四种 Agent 类型**：AI 机器人、Webhook、知识库、真实用户
2. **应用隔离**：每个应用（产品/公司）的数据完全隔离
3. **Human-in-the-Loop**：AI 回复可配置为需要人工审批
4. **工具调用**：AI 机器人可通过 tool calling 执行外部操作
5. **技能系统**：通过 SKILL.md 扩展 AI 能力

## 支持的模型

- DeepSeek Chat（默认）
- DeepSeek Reasoner
- DeepSeek V4 Flash

## 系统架构

前端使用 weifuwu/ui-dom 信号驱动 UI，后端使用 weifuwu Router + Postgres + 可选的 Redis。`
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
    INSERT INTO agents (app_id, type, name, description, webhook_url, webhook_secret, webhook_retry_count, is_active)
    VALUES (${DEMO_APP_ID}, 'webhook', '通知机器人', '接收外部系统回调通知',
      'https://hooks.example.com/notify', 'sk-demo-webhook-secret', 3, true)
    RETURNING id
  `
  console.log('  ✓ Webhook Agent: 通知机器人')

  // ════════════════════════════════════════════════════
  // 6. 部门（直接挂应用——一个 app 就是一个产品/公司）
  // ════════════════════════════════════════════════════

  // 部门 1: 技术部（开发 + 全员）
  const [devDept] = await sql`
    INSERT INTO departments (app_id, name, is_dm)
    VALUES (${DEMO_APP_ID}, '技术部', false)
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
    INSERT INTO departments (app_id, name, is_dm)
    VALUES (${DEMO_APP_ID}, '客服中心', false)
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
    INSERT INTO departments (app_id, name, is_dm)
    VALUES (${DEMO_APP_ID}, '运维组', false)
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
    INSERT INTO departments (app_id, name, is_dm)
    VALUES (${DEMO_APP_ID}, '张明 — 小码', true)
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
  // 6b. 组织层级：部门经理（department 类型 agent——代表部门对外协作）
  // ════════════════════════════════════════════════════
  // 经理 = 部门代表：加入上级部门（管理委员会）形成组织层级；被 @ 时用 call_agent 分派成员干活
  async function makeManager(deptRow, deptName) {
    const [mgr] = await sql`
      INSERT INTO agents (app_id, type, name, description, model, department_id, is_active, tools, allow_file_tools)
      VALUES (${DEMO_APP_ID}, 'department', ${deptName + '经理'}, ${'部门经理——代表「' + deptName + '」对外协作'},
        'deepseek-v4-flash', ${deptRow.id}, true, '[]', true)
      RETURNING id, name
    `
    await sql`
      INSERT INTO department_members (department_id, agent_id, role)
      VALUES (${deptRow.id}, ${mgr.id}, 'manager')
      ON CONFLICT DO NOTHING
    `
    return mgr
  }
  const devMgr = await makeManager(devDept, '技术部')
  const csMgr = await makeManager(csDept, '客服中心')
  const opsMgr = await makeManager(opsDept, '运维组')
  console.log('  ✓ 部门经理: 技术部经理 / 客服中心经理 / 运维组经理（department 类型——代表部门）')

  // 上级部门「管理委员会」——三个经理加入，形成组织层级（两层）
  const [boardDept] = await sql`
    INSERT INTO departments (app_id, name, is_dm)
    VALUES (${DEMO_APP_ID}, '管理委员会', false)
    RETURNING id
  `
  const boardMgr = await makeManager(boardDept, '管理委员会')
  await sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES
      (${boardDept.id}, ${adminAgent.id}, 'admin'),
      (${boardDept.id}, ${devMgr.id}, 'member'),
      (${boardDept.id}, ${csMgr.id}, 'member'),
      (${boardDept.id}, ${opsMgr.id}, 'member')
    ON CONFLICT DO NOTHING
  `
  console.log('  ✓ 管理委员会（上级部门）: 技术部/客服中心/运维组经理加入——两层组织层级')

  // 经理提示词回填（部门成员名单——call_agent 分派用）
  for (const [mgr, deptRow, deptName] of [[devMgr, devDept, '技术部'], [csMgr, csDept, '客服中心'], [opsMgr, opsDept, '运维组'], [boardMgr, boardDept, '管理委员会']]) {
    try {
      const members = await sql`
        SELECT a.name FROM department_members dm JOIN agents a ON a.id = dm.agent_id
        WHERE dm.department_id = ${deptRow.id} AND a.type IN ('ai', 'knowledge_base') AND a.id != ${mgr.id}
      `
      const names = (members ?? []).map((m) => m.name).join('、')
      await sql`
        UPDATE agents SET system_prompt = ${`你是「${deptName}」的部门经理，代表该部门参与协作。\n\n你的职责：\n1. 作为部门代表回答与其他部门的协作请求\n2. 需要部门成员实际干活时，用 call_agent 工具把任务分派给成员（一次一个成员）\n3. 汇总成员结果后回复——你就是「${deptName}」的对外出口\n\n部门成员：${names || '（暂无 AI 成员——请先给部门添加 AI 能力）'}\n\n任务完成后按以下结构汇报：\n- ✅ 已完成：列出完成的事项\n- ⚠️ 未完成：列出未完成的事项及原因（没有则省略）\n- 📦 产物：生成的文件/结果位置（没有则省略）`}
        WHERE id = ${mgr.id}
      `
    } catch { /* 提示词回填失败不阻断 */ }
  }
  console.log('  ✓ 经理提示词已生成（部门成员名单——call_agent 分派）')


  // 三层模型：部门 = 工作目录（默认 {AGENT_WORKSPACE_ROOT}/{department_id}/）
  // 创建演示目录与交付物文件（AI 工具经沙盒容器读写——用户文件浏览器可见）
  const workspaceRoot = process.env.AGENT_WORKSPACE_ROOT
    ? resolve(process.env.AGENT_WORKSPACE_ROOT)
    : resolve(__dirname, '..', 'data', 'workspaces')
  const mkdir = (await import('node:fs/promises')).mkdir
  const writeFile = (await import('node:fs/promises')).writeFile
  const rm = (await import('node:fs/promises')).rm

  // 清理旧模型（agent 级目录）残留——三层模型目录归属部门
  for (const oldAgentDir of [devAgent.id, opsAgent.id]) {
    await rm(join(workspaceRoot, oldAgentDir), { recursive: true, force: true })
  }

  const devWs = join(workspaceRoot, devDept.id)
  await mkdir(devWs, { recursive: true })
  await writeFile(join(devWs, 'README.md'), `# Demo Project

这是一个演示项目——位于「技术部」共享工作目录。

## 目录结构

- \`src/\` — 源代码
- \`tests/\` — 测试文件
- \`README.md\` — 本文件

> 三层模型：部门 = 工作目录，沙盒 = 计算资源，Agent = 能力。
> 小码/小悟 的工具（read/write/bash）都在此目录执行——交付物实时可见。
`)
  await mkdir(join(devWs, 'src'), { recursive: true })
  await writeFile(join(devWs, 'src', 'index.ts'), `// 入口文件
console.log("Hello, Agent!")
`)
  await writeFile(join(devWs, 'src', 'utils.ts'), `// 工具函数
export function add(a: number, b: number): number {
  return a + b
}
`)

  // 运维组目录（小维的工具执行目录——监控脚本）
  const opsWs = join(workspaceRoot, opsDept.id)
  await mkdir(opsWs, { recursive: true })
  await mkdir(join(opsWs, 'scripts'), { recursive: true })
  await writeFile(join(opsWs, 'scripts', 'check-disk.sh'), `#!/bin/bash
# 磁盘水位检查
df -h / | awk 'NR==2 {print \"磁盘使用率: \" \$5}'
`)
  console.log('  ✓ 部门工作目录 + 演示交付物文件已创建（技术部/运维组）')


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
      (${devDept.id}, ${devAgent.id}, '✅ 已在部门工作目录完成初始化：\n\n- \`README.md\` — 项目说明\n- \`src/index.ts\` — 入口文件\n- \`src/utils.ts\` — 工具函数\n\n📦 交付物在右侧「交付物（共享目录）」面板可见——你也可以随时让我在共享目录里写文件。', 'text', NOW() - INTERVAL '23 minutes'),

      -- 客服中心对话
      (${csDept.id}, ${userAgent.id}, '请问如何创建一个 AI 机器人？', 'text', NOW() - INTERVAL '20 minutes'),
      (${csDept.id}, ${csAgent.id}, '您好！创建 AI 机器人的步骤如下：\n\n1. 进入 **Agent** 页面，点击"创建 Agent"\n2. 选择一个角色模板（如"开发助手"或"智能客服"）\n3. 填写名称，调整系统提示词\n4. 点击提交即可\n\n更详细的说明可以参考我们的知识库文档。', 'text', NOW() - INTERVAL '18 minutes'),
      (${csDept.id}, ${userAgent.id}, '好的，再问一下怎么配置 HITL？', 'text', NOW() - INTERVAL '15 minutes'),
      (${csDept.id}, ${csAgent.id}, 'HITL 配置很简单：\n\n1. 在创建或编辑 AI 机器人时，找到「人工审批」开关\n2. 开启后，AI 的回复不会直接发送，而是生成草稿\n3. 管理员在聊天界面会看到审批按钮，可以批准或拒绝\n\n这样可以确保敏感场景下的回复质量。还有其他问题吗？', 'text', NOW() - INTERVAL '13 minutes'),

      -- 运维组对话
      (${opsDept.id}, ${adminAgent.id}, '小维，收到一条告警：服务器 CPU 负载超过 90%', 'text', NOW() - INTERVAL '10 minutes'),
      (${opsDept.id}, ${opsAgent.id}, '⚠️ **收到告警，正在诊断**\n\n1. 已在运维组工作目录放好检查脚本 \`scripts/check-disk.sh\`（磁盘水位）\n2. 需网络权限才能抓取 CPU 详情——默认沙盒无网络\n\n请确认是否允许我执行诊断命令（bash 在沙盒容器内执行，安全隔离）。', 'text', NOW() - INTERVAL '8 minutes'),

      -- 张明-小码 单聊
      (${dmDept.id}, ${adminAgent.id}, '小码，帮我写一个 git hook 脚本，在 commit 前自动运行 lint', 'text', NOW() - INTERVAL '5 minutes'),
      (${dmDept.id}, ${devAgent.id}, '这是一个 pre-commit hook 脚本：\n\n\`\`\`bash\n#!/bin/bash\n# .git/hooks/pre-commit\n\n# 运行 ESLint\necho "Running ESLint..."\nnpx eslint . --ext .ts,.tsx\nif [ $? -ne 0 ]; then\n  echo "❌ ESLint 检查未通过，请修复后重新提交"\n  exit 1\nfi\n\n# 运行类型检查\necho "Running Type Check..."\nnpx tsc --noEmit\nif [ $? -ne 0 ]; then\n  echo "❌ 类型检查未通过，请修复后重新提交"\n  exit 1\nfi\n\necho "✅ 所有检查通过"\n\`\`\`\n\n安装方式：\n\`\`\`bash\nchmod +x .git/hooks/pre-commit\n\`\`\`', 'text', NOW() - INTERVAL '3 minutes')
  `
  console.log('  ✓ 消息历史: 10 条（覆盖 4 个部门）')

  // 7b. 审批待办草稿（Approvals 页数据——HITL 小维生成待审批回复）
  await sql`
    INSERT INTO messages (department_id, sender_id, content, msg_type, ai_draft, ai_approved, ai_step, created_at)
    VALUES
      (${opsDept.id}, ${opsAgent.id}, '[AI 生成中...]', 'text',
       '⚠️ 检测到服务器 cpu 使用率持续高于 85%（已持续 10 分钟）。建议：\n1. 重启 nginx 工作进程释放缓存\n2. 扩容 2 台实例分担负载\n\n请确认是否执行扩容操作。', NULL,
       '{"steps":["llm"]}', NOW() - INTERVAL '12 minutes'),
      (${opsDept.id}, ${opsAgent.id}, '[AI 生成中...]', 'text',
       '检测到磁盘空间不足（/data 使用率 92%）。建议清理 30 天前的备份文件（约 4.2GB）。请确认清理范围。', NULL,
       '{"steps":["llm"]}', NOW() - INTERVAL '5 minutes')
  `
  console.log('  ✓ 审批待办: 2 条 HITL 草稿（运维组待审批）')

  // ════════════════════════════════════════════════════
  // 7c. 沙盒演示记录（三层模型：sandbox = 计算资源——绑定部门）
  // ════════════════════════════════════════════════════
  // requested = 惰性（容器未起——首次 AI 工具调用自动创建）；
  // 工作台/部门页显示环境状态点「环境待启动（首次干活自动创建）」
  await sql`
    INSERT INTO sandboxes (app_id, department_id, name, status, mode, image, network, memory_mb, cpus, workspace)
    VALUES
      (${DEMO_APP_ID}, ${devDept.id}, '技术部', 'requested', 'persistent', 'ap-sandbox:latest', false, 512, 1, ${devWs}),
      (${DEMO_APP_ID}, ${opsDept.id}, '运维组', 'requested', 'persistent', 'ap-sandbox:latest', false, 512, 1, ${opsWs})
  `
  console.log('  ✓ 沙盒演示记录: 技术部 / 运维组（requested——首次干活自动创建）')

  // ════════════════════════════════════════════════════
  // 8. Agent 执行日志（Dashboard 面板数据）
  // ════════════════════════════════════════════════════

  await sql`
    INSERT INTO agent_logs (agent_id, app_id, department_id, messages_count, steps_count, tokens_prompt, tokens_completion, tokens_total, elapsed_ms, success, created_at)
    VALUES
      -- 小码执行记录
      (${devAgent.id}, ${DEMO_APP_ID}, ${devDept.id}, 10, 2, 850, 420, 1270, 3200, true, NOW() - INTERVAL '29 minutes'),
      (${devAgent.id}, ${DEMO_APP_ID}, ${devDept.id}, 15, 3, 1200, 680, 1880, 5100, true, NOW() - INTERVAL '24 minutes'),
      (${devAgent.id}, ${DEMO_APP_ID}, ${dmDept.id}, 5, 1, 340, 180, 520, 1800, true, NOW() - INTERVAL '4 minutes'),
      -- 小应执行记录
      (${csAgent.id}, ${DEMO_APP_ID}, ${csDept.id}, 8, 1, 560, 210, 770, 2400, true, NOW() - INTERVAL '19 minutes'),
      (${csAgent.id}, ${DEMO_APP_ID}, ${csDept.id}, 12, 1, 780, 340, 1120, 3100, true, NOW() - INTERVAL '14 minutes'),
      -- 小维执行记录（有一次失败）
      (${opsAgent.id}, ${DEMO_APP_ID}, ${opsDept.id}, 6, 3, 980, 560, 1540, 4500, true, NOW() - INTERVAL '9 minutes'),
      (${opsAgent.id}, ${DEMO_APP_ID}, ${opsDept.id}, 3, 2, 420, 0, 420, 12000, false, NOW() - INTERVAL '7 minutes')
  `
  console.log('  ✓ Agent 执行日志: 7 条（含 1 条失败记录）')

  // ════════════════════════════════════════════════════
  // 9. Webhook 调用日志
  // ════════════════════════════════════════════════════

  await sql`
    INSERT INTO webhook_logs (agent_id, app_id, request_body, response_body, response_status, elapsed_ms, success, created_at)
    VALUES
      (${webhookAgent.id}, ${DEMO_APP_ID}, '{"event":"deploy","status":"success"}', '{"reply":"部署成功通知已收到"}', 200, 1200, true, NOW() - INTERVAL '1 hour'),
      (${webhookAgent.id}, ${DEMO_APP_ID}, '{"event":"monitor","alert":"cpu_high"}', '{"reply":"告警已记录，已通知运维组"}', 200, 980, true, NOW() - INTERVAL '30 minutes'),
      (${webhookAgent.id}, ${DEMO_APP_ID}, '{"event":"deploy","status":"failed"}', '{"reply":"部署失败通知已收到"}', 200, 1500, true, NOW() - INTERVAL '15 minutes')
  `
  console.log('  ✓ Webhook 调用日志: 3 条')

  // ════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════
  // 9b. 第二租户「星辰科技」（多租户演示——管理后台/用量）
  // ════════════════════════════════════════════════════
  // 9b. 第二租户「星辰科技」（多租户演示——管理后台/用量）
  // ════════════════════════════════════════════════════

  const ACME_APP_ID = '00000000-0000-0000-0000-000000000002'
  const bossPassword = await hashPassword('acme123')
  const staffPassword = await hashPassword('acme123')
  const [boss] = await sql`
    INSERT INTO _weifuwu_users (email, name, password_hash, role)
    VALUES ('boss@acme.local', '王总', ${bossPassword}, 'member')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
    RETURNING id, name
  `
  const [staff] = await sql`
    INSERT INTO _weifuwu_users (email, name, password_hash, role)
    VALUES ('staff@acme.local', '小林', ${staffPassword}, 'member')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
    RETURNING id, name
  `
  await sql`
    INSERT INTO _weifuwu_apps (id, slug, name, owner_user_id, plan, trial_ends_at, monthly_token_limit)
    VALUES (${ACME_APP_ID}, 'acme', '星辰科技', ${boss.id}, 'free', NOW() + INTERVAL '10 days', 50000)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, plan = EXCLUDED.plan
  `
  await sql`
    INSERT INTO _weifuwu_app_members (app_id, user_id, role, invited_by)
    VALUES (${ACME_APP_ID}, ${boss.id}, 'owner', ${boss.id}), (${ACME_APP_ID}, ${staff.id}, 'member', ${boss.id})
    ON CONFLICT DO NOTHING
  `
  const [bossAgent] = await sql`
    INSERT INTO agents (app_id, type, name, user_id, is_active)
    VALUES (${ACME_APP_ID}, 'user', ${boss.name}, ${boss.id}, true) RETURNING id
  `
  const [staffAgent] = await sql`
    INSERT INTO agents (app_id, type, name, user_id, is_active)
    VALUES (${ACME_APP_ID}, 'user', ${staff.name}, ${staff.id}, true) RETURNING id
  `
  const [acmeAi] = await sql`
    INSERT INTO agents (app_id, type, name, description, model, system_prompt, temperature, max_tokens, is_active, tools)
    VALUES (${ACME_APP_ID}, 'ai', '小星', '产品咨询助手', 'deepseek-v4-flash',
      '你是星辰科技的产品助手，回答简洁准确。', 0.7, 2048, true, '[]')
    RETURNING id
  `
  const [acmeDept] = await sql`
    INSERT INTO departments (app_id, name, is_dm) VALUES (${ACME_APP_ID}, '产品咨询组', false) RETURNING id
  `
  await sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES (${acmeDept.id}, ${bossAgent.id}, 'admin'), (${acmeDept.id}, ${staffAgent.id}, 'member'), (${acmeDept.id}, ${acmeAi.id}, 'member')
  `
  await sql`
    INSERT INTO messages (department_id, sender_id, content, msg_type, created_at)
    VALUES
      (${acmeDept.id}, ${staffAgent.id}, '小星，我们产品的试用期是多久？', 'text', NOW() - INTERVAL '2 hours'),
      (${acmeDept.id}, ${acmeAi.id}, '我们提供 14 天免费试用，支持 5 万 token 用量。升级 Pro 后额度提升至 100 万。', 'text', NOW() - INTERVAL '110 minutes')
  `
  await sql`
    INSERT INTO agent_logs (agent_id, app_id, department_id, messages_count, steps_count, tokens_prompt, tokens_completion, tokens_total, elapsed_ms, success, created_at)
    VALUES (${acmeAi.id}, ${ACME_APP_ID}, ${acmeDept.id}, 6, 1, 420, 210, 630, 2400, true, NOW() - INTERVAL '100 minutes')
  `
  console.log('  ✓ 第二租户: 星辰科技（acme）——boss@acme.local / staff@acme.local')

  await pg.close()

  // ════════════════════════════════════════════════════
  // 10. 完成 — 打印摘要
  // ════════════════════════════════════════════════════

  console.log('\n╔══════════════════════════════════════════════════════╗')
  console.log('║            🎉 种子数据创建完成                       ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log()
  console.log('  📧 登录凭据（角色对照）')
  console.log('    ┌─ 租户「演示科技有限公司」(demo)')
  console.log('    │  老板/Owner : admin@demo.com / admin123')
  console.log('    │  员工/Member : user@demo.com / user123')
  console.log('    └─ 租户「星辰科技」(acme)')
  console.log('       老板/Owner : boss@acme.local / acme123')
  console.log('       员工/Member : staff@acme.local / acme123')
  console.log()
  const adminEmails = process.env.ADMIN_EMAILS ?? ''
  console.log('  🛡 平台管理员（租户管理后台 /admin）')
  if (adminEmails.toLowerCase().includes('admin@demo.com')) {
    console.log('    ✓ admin@demo.com 已在 ADMIN_EMAILS——登录后可访问 /admin')
  } else {
    console.log('    ✗ 未配置——启动时加 ADMIN_EMAILS="admin@demo.com" 后登录 admin@demo.com 可访问 /admin')
  }
  console.log()
  console.log('  📋 体验要点')
  console.log('    · 工作台：项目空间卡片（成员/最近消息/环境状态点）——三层模型入口')
  console.log('    · 项目空间三栏：左 AI 成员呼吸灯 / 中聊天流 / 右交付物（AI 写文件实时可见）')
  console.log('    · 沙盒记录：技术部/运维组 requested（首次 AI 干活自动创建容器）')
  console.log('    · Approvals 页：2 条待审批草稿（运维组 HITL）')
  console.log('    · 运营报表：部门维度用量看板 + 配额告警')
  console.log('    · /admin（管理员）：多租户列表 + 使用概览 + 停用/开通 Pro')
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
  console.log('  👥 部门（5个 + 组织层级）')
  console.log('    技术部 — 张明、李华、小码、小悟 + 技术部经理')
  console.log('    客服中心 — 张明、小应、产品知识库 + 客服中心经理')
  console.log('    运维组 — 张明、小维、通知机器人 + 运维组经理')
  console.log('    张明-小码 — 单聊')
  console.log('    管理委员会 — 技术部/客服中心/运维组经理加入（两层组织）')
  console.log()
  console.log('  📊 Dashboard 数据')
  console.log('    4 个 Agent · 7 条执行日志 · 10 条消息 · 3 条 Webhook 日志')
  console.log()
  console.log('  💡 建议体验顺序')
  console.log('    1. 浏览器打开 http://localhost:3000')
  console.log('    2. 用 admin@demo.com / admin123 登录')
  console.log('    3. 工作台：查看项目空间卡片（环境状态点）')
  console.log('    4. 进入「技术部」项目空间：三栏工作区——右栏交付物已有演示文件')
  console.log('    5. 聊天 @小码 让 AI 干活（如"在共享目录写一份周报.md"）——呼吸灯/文件卡片/交付物实时刷新')
  console.log('    6. 运营报表：部门维度用量看板')
  console.log('    7. 沙盒页：查看技术部/运维组环境（requested——首次干活自动启动）')
}

main().catch((err) => {
  console.error('[seed] 失败:', err)
  process.exit(1)
})
