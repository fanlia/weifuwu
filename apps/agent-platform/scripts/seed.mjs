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
  const { orm } = pg
  // ORM AST 面（协议层 = AST——无 SQL 模板/unsafe）——辅助函数收拢样板
  const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString()
  const ins = (table, rows, opts = {}) => {
    const b = orm.query.insert(table).rows(rows)
    if (opts.conflict !== undefined) b.onConflict(opts.conflict, opts.update ?? false, opts.merge)
    if (opts.returning) b.returning(...opts.returning)
    return b.run()
  }
  // 全表清空（compileDelete 禁止空 where——哨兵集合条件 = 删除一切）
  const SENT = '00000000-0000-0000-0000-000000000000'
  const delAll = (table, key = 'id') =>
    orm.query.delete(table).where({ [key]: { notIn: [SENT] } }).run()

  // ── 清空业务数据（保留应用和用户 UUID 不变） ────────
  console.log('  … 清空业务数据...')
  for (const [t, k] of [['webhook_logs'], ['agent_logs'], ['kb_chunks'], ['kb_documents'], ['sandboxes'], ['departments'], ['agents'], ['messages']]) await delAll(t)
  await delAll('agent_skills', 'agent_id')
  await delAll('department_members', 'agent_id')
  console.log('  ✓ 已清空业务数据')

  // ── 确保 schema 存在 ─────────────────────────────────
  console.log('  … 确保 schema...')
  const schemaPath = resolve(__dirname, '..', 'src', 'db', 'schema.sql')
  await pg.runMigration('seed-schema', readFileSync(schemaPath, 'utf-8'))
  console.log('  ✓ schema')

  // ════════════════════════════════════════════════════
  // 1. 应用 + 用户（框架 userSystem 三层模型）
  // ════════════════════════════════════════════════════

  // 使用固定 UUID 确保 re-seed 后 app ID 永远不变
  // 应用 token 中的 appId 始终有效，无需重新登录
  const DEMO_APP_ID = '00000000-0000-0000-0000-000000000001'
  const adminPassword = await hashPassword('admin123')
  const [admin] = await ins('_weifuwu_users', [{ email: 'admin@demo.com', name: '张明', password_hash: adminPassword, role: 'admin' }], { conflict: 'email', update: true, returning: ['id', 'name'] })
  console.log('  ✓ 管理员: admin@demo.com / admin123')

  const userPassword = await hashPassword('user123')
  const [user] = await ins('_weifuwu_users', [{ email: 'user@demo.com', name: '李华', password_hash: userPassword, role: 'member' }], { conflict: 'email', update: true, returning: ['id', 'name'] })
  console.log('  ✓ 用户: user@demo.com / user123')

  // 应用（= 产品/公司——一个 app 就是一个公司）
  await ins('_weifuwu_apps', [{ id: DEMO_APP_ID, slug: 'demo', name: '演示科技有限公司', owner_user_id: admin.id, sandbox_quota: 20 }], { conflict: 'id', update: true, merge: { sandbox_quota: 20 } })
  // 成员关系（owner + member）
  await ins('_weifuwu_app_members', [
    { app_id: DEMO_APP_ID, user_id: admin.id, role: 'owner', invited_by: admin.id },
    { app_id: DEMO_APP_ID, user_id: user.id, role: 'member', invited_by: admin.id },
  ], { conflict: undefined, update: false })
  console.log('  ✓ 应用: 演示科技有限公司（demo）')

  // ════════════════════════════════════════════════════
  // 2. Agent — 真实用户映射
  // ════════════════════════════════════════════════════

  const [adminAgent] = await ins('agents', [{ app_id: DEMO_APP_ID, type: 'user', name: admin.name, user_id: admin.id, is_active: true }], { returning: ['id'] })
  const [userAgent] = await ins('agents', [{ app_id: DEMO_APP_ID, type: 'user', name: user.name, user_id: user.id, is_active: true }], { returning: ['id'] })
  console.log('  ✓ 用户 Agent: 张明, 李华')

  // ════════════════════════════════════════════════════
  // 3. Agent — 从角色模板创建 AI 机器人
  // ════════════════════════════════════════════════════

  // 3a. 开发助手（带工作空间 + 文件工具 + bash）
  const devTemplate = ROLE_TEMPLATES.find(t => t.slug === 'developer')
  const [devAgent] = await ins('agents', [{
    app_id: DEMO_APP_ID, type: 'ai', name: '小码', description: '代码编写与项目重构助手',
    model: 'deepseek-v4-flash', system_prompt: devTemplate.default_system_prompt,
    temperature: devTemplate.default_temperature, max_tokens: devTemplate.default_max_tokens,
    allow_file_tools: devTemplate.default_allow_file_tools, allow_command_exec: devTemplate.default_allow_command_exec,
    is_active: true, tools: '[]',
  }], { returning: ['id'] })
  // 绑定技能
  for (const skillName of devTemplate.default_skills) {
    const skillDir = resolve(BUILTIN_SKILLS_DIR, skillName)
    if (existsSync(resolve(skillDir, 'SKILL.md'))) {
      await ins('agent_skills', [{ agent_id: devAgent.id, skill_name: skillName, skill_dir: skillDir, enabled: true }])
    }
  }
  console.log(`  ✓ AI Agent: 小码（开发助手模板）${devTemplate.default_skills.length} 个技能已绑定`)

  // 3b. 智能客服（带知识库 + HITL）
  const csTemplate = ROLE_TEMPLATES.find(t => t.slug === 'customer-support')
  const [csAgent] = await ins('agents', [{
    app_id: DEMO_APP_ID, type: 'ai', name: '小应', description: '客户服务与 FAQ 自动回复',
    model: 'deepseek-v4-flash', system_prompt: csTemplate.default_system_prompt,
    temperature: csTemplate.default_temperature, max_tokens: csTemplate.default_max_tokens,
    human_in_the_loop: true, is_active: true, tools: '[]',
  }], { returning: ['id'] })
  for (const skillName of csTemplate.default_skills) {
    const skillDir = resolve(BUILTIN_SKILLS_DIR, skillName)
    if (existsSync(resolve(skillDir, 'SKILL.md'))) {
      await ins('agent_skills', [{ agent_id: csAgent.id, skill_name: skillName, skill_dir: skillDir, enabled: true }])
    }
  }
  console.log('  ✓ AI Agent: 小应（智能客服模板 + HITL）')

  // 3c. 运维机器人（带工作空间 + bash + HITL）
  const opsTemplate = ROLE_TEMPLATES.find(t => t.slug === 'ops-bot')
  const [opsAgent] = await ins('agents', [{
    app_id: DEMO_APP_ID, type: 'ai', name: '小维', description: '系统监控与自动化运维',
    model: 'deepseek-v4-flash', system_prompt: opsTemplate.default_system_prompt,
    temperature: opsTemplate.default_temperature, max_tokens: opsTemplate.default_max_tokens,
    allow_file_tools: opsTemplate.default_allow_file_tools, allow_command_exec: opsTemplate.default_allow_command_exec,
    human_in_the_loop: true, is_active: true, tools: '[]',
  }], { returning: ['id'] })
  for (const skillName of opsTemplate.default_skills) {
    const skillDir = resolve(BUILTIN_SKILLS_DIR, skillName)
    if (existsSync(resolve(skillDir, 'SKILL.md'))) {
      await ins('agent_skills', [{ agent_id: opsAgent.id, skill_name: skillName, skill_dir: skillDir, enabled: true }])
    }
  }
  console.log('  ✓ AI Agent: 小维（运维机器人模板 + HITL + 工作空间）')

  // 3d. 通用助手（无特殊权限）
  const [generalAgent] = await ins('agents', [{
    app_id: DEMO_APP_ID, type: 'ai', name: '小悟', description: '通用问答助手',
    model: 'deepseek-v4-flash', system_prompt: '你是一个有帮助的 AI 助手，名叫小悟。回答简洁、准确、友好。',
    temperature: 0.7, max_tokens: 2048, is_active: true, tools: '[]',
  }], { returning: ['id'] })
  console.log('  ✓ AI Agent: 小悟（通用助手）')

  // ════════════════════════════════════════════════════
  // 4. Agent — 知识库
  // ════════════════════════════════════════════════════

  const [kbAgent] = await ins('agents', [{ app_id: DEMO_APP_ID, type: 'knowledge_base', name: '产品知识库', description: '产品手册与 FAQ 文档库', chunk_size: 500, chunk_overlap: 50, is_active: true }], { returning: ['id'] })

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
  const [doc1] = await ins('kb_documents', [{ agent_id: kbAgent.id, filename: '产品介绍.md', content: doc1Content, chunk_count: 2 }], { returning: ['id'] })
  // 模拟向量（随机 1024 维）
  function randomVec() {
    return '[' + Array.from({ length: 1024 }, () => (Math.random() * 2 - 1).toFixed(6)).join(',') + ']'
  }
  await ins('kb_chunks', [{ document_id: doc1.id, agent_id: kbAgent.id, content: doc1Content.slice(0, 300), chunk_index: 0, embedding: randomVec() }])
  await ins('kb_chunks', [{ document_id: doc1.id, agent_id: kbAgent.id, content: doc1Content.slice(300), chunk_index: 1, embedding: randomVec() }])

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
  const [doc2] = await ins('kb_documents', [{ agent_id: kbAgent.id, filename: 'FAQ.md', content: doc2Content, chunk_count: 2 }], { returning: ['id'] })
  await ins('kb_chunks', [{ document_id: doc2.id, agent_id: kbAgent.id, content: doc2Content.slice(0, 250), chunk_index: 0, embedding: randomVec() }])
  await ins('kb_chunks', [{ document_id: doc2.id, agent_id: kbAgent.id, content: doc2Content.slice(250), chunk_index: 1, embedding: randomVec() }])
  console.log('  ✓ 知识库 Agent: 产品知识库（含 2 篇文档 4 个分块）')

  // ════════════════════════════════════════════════════
  // 5. Agent — Webhook
  // ════════════════════════════════════════════════════

  const [webhookAgent] = await ins('agents', [{ app_id: DEMO_APP_ID, type: 'webhook', name: '通知机器人', description: '接收外部系统回调通知', webhook_url: 'https://hooks.example.com/notify', webhook_secret: 'sk-demo-webhook-secret', webhook_retry_count: 3, is_active: true }], { returning: ['id'] })
  console.log('  ✓ Webhook Agent: 通知机器人')

  // ════════════════════════════════════════════════════
  // 6. 部门（直接挂应用——一个 app 就是一个产品/公司）
  // ════════════════════════════════════════════════════

  // 部门 1: 技术部（开发 + 全员）
  const [devDept] = await ins('departments', [{ app_id: DEMO_APP_ID, name: '技术部', is_dm: false }], { returning: ['id'] })
  await ins('department_members', [
    { department_id: devDept.id, agent_id: adminAgent.id, role: 'admin' },
    { department_id: devDept.id, agent_id: userAgent.id, role: 'member' },
    { department_id: devDept.id, agent_id: devAgent.id, role: 'member' },
    { department_id: devDept.id, agent_id: generalAgent.id, role: 'member' },
  ])


  // 部门 2: 客服中心（智能客服 + 知识库）
  const [csDept] = await ins('departments', [{ app_id: DEMO_APP_ID, name: '客服中心', is_dm: false }], { returning: ['id'] })
  await ins('department_members', [
    { department_id: csDept.id, agent_id: adminAgent.id, role: 'admin' },
    { department_id: csDept.id, agent_id: csAgent.id, role: 'member' },
    { department_id: csDept.id, agent_id: kbAgent.id, role: 'member' },
  ])

  // 部门 3: 运维组（运维机器人 + HITL）
  const [opsDept] = await ins('departments', [{ app_id: DEMO_APP_ID, name: '运维组', is_dm: false }], { returning: ['id'] })
  await ins('department_members', [
    { department_id: opsDept.id, agent_id: adminAgent.id, role: 'admin' },
    { department_id: opsDept.id, agent_id: opsAgent.id, role: 'member' },
    { department_id: opsDept.id, agent_id: webhookAgent.id, role: 'member' },
  ])

  // 部门 4: 单聊 — 张明和小码的 DM
  const [dmDept] = await ins('departments', [{ app_id: DEMO_APP_ID, name: '张明 — 小码', is_dm: true }], { returning: ['id'] })
  await ins('department_members', [
    { department_id: dmDept.id, agent_id: adminAgent.id, role: 'admin' },
    { department_id: dmDept.id, agent_id: devAgent.id, role: 'member' },
  ])

  console.log('  ✓ 4 个部门: 技术部 / 客服中心 / 运维组 / 张明-小码')

  // ════════════════════════════════════════════════════
  // 6c. 问卷填写群（seed 自动建好——5 个机器人——用户进群发消息 @全员 填问卷——
  //     人设/填写纪律来自 survey-agents-lib.mjs（与 seed-survey-agents 单一规则源））
  // ════════════════════════════════════════════════════
  // 5 角色独立部门（执行归属 = 独立沙盒——架构不变量：@全员 群消息 + 独立部门沙盒并发）
  // 人设/填写纪律内嵌（与 scripts/seed-survey-agents.mjs 同步维护——10 人设的全量版在那边）
  const SURVEY_URL = process.env.SURVEY_URL ?? `${process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'}/demo-survey`
  const GROUP_NAME = '问卷填写群'
  const GROUP_ROLES = [
    { name: '财务小王', roleLabel: '财务视角', expertise: '成本/预算/ROI', prompt: '你是财务部的小王，35 岁，关注成本与预算。填问卷时：对价格敏感，倾向低分，反馈聚焦性价比与 ROI。回答简洁务实。' },
    { name: '市场小李', roleLabel: '市场视角', expertise: '品牌/渠道/增长', prompt: '你是市场部的小李，28 岁，关注品牌与增长。填问卷时：乐观积极，给高分，反馈聚焦品牌传播与市场活动。语气热情。' },
    { name: '产品老张', roleLabel: '产品视角', expertise: '体验/功能/roadmap', prompt: '你是产品经理老张，38 岁，关注体验与功能。填问卷时：评分中等偏上，反馈聚焦易用性与功能缺口，给具体改进建议。' },
    { name: '客服小陈', roleLabel: '客服视角', expertise: '售后/响应/满意度', prompt: '你是客服主管小陈，30 岁，关注售后响应。填问卷时：评分取决于售后体验的想象，反馈聚焦响应速度与服务态度。' },
    { name: '研发大刘', roleLabel: '技术视角', expertise: '性能/安全/架构', prompt: '你是技术负责人大刘，40 岁，关注性能与安全。填问卷时：评分保守（3-4），反馈聚焦技术稳定性、安全性与性能指标。' },
  ]
  const buildSurveyPrompt = (p) => `${p.prompt}

【问卷填写任务（模拟数据收集）】
当用户要求填写问卷时（可选工具——不强制）：
1. 用 agent-browser 打开问卷：agent-browser open "${SURVEY_URL}?s=${encodeURIComponent(p.name)}"
   ⚠️ 容器内访问：你在沙盒容器里——localhost 是容器自身（问卷连不上）——若 open localhost 失败，
   改用宿主地址 agent-browser open "http://host.docker.internal:3000/demo-survey?s=${encodeURIComponent(p.name)}"
2. agent-browser snapshot 读取题目与控件 ref——逐题作答（fill 文本 / select 下拉 / check 勾选 / click 单选与提交）
3. 按你的${p.roleLabel}作答：评分与反馈符合你的身份
4. 提交后 read/snapshot 验证成功页（「✅ 已提交」锁定态）
5. 完成后把你的作答结果写入工作目录：用 write 工具创建 survey-result.json，内容：
   {"name":"${p.name}","role":"${p.roleLabel}","submitted":true,"answers":{...逐题答案...},"verified":true}
6. 完成后执行 agent-browser close 关闭浏览器会话

【工具说明】agent-browser 是浏览器操作工具（真实网页导航/快照/填写/点击）——
仅在需要真实浏览器操作时使用（如填写问卷）；普通对话/咨询直接回复即可——
不强制调用任何工具。

【产物纪律】survey-result.json 是本次任务的交付物——写入后工作目录可见。`
  const surveyRoles = []
  for (const p of GROUP_ROLES) {
    const [roleDept] = await ins('departments', [{ app_id: DEMO_APP_ID, name: p.name, is_dm: false }], { returning: ['id'] })
    const [roleAgent] = await ins('agents', [{
      app_id: DEMO_APP_ID, type: 'ai', name: p.name, description: p.roleLabel + '——' + p.expertise,
      model: 'deepseek-v4-flash', department_id: roleDept.id, system_prompt: buildSurveyPrompt(p),
      temperature: 0.7, max_tokens: 4096, allow_file_tools: true, allow_command_exec: true,
      allow_network: true, is_active: true, tools: '[]',
    }], { returning: ['id'] })
    await ins('department_members', [{ department_id: roleDept.id, agent_id: roleAgent.id, role: 'member' }])
    surveyRoles.push({ agent: roleAgent.id, dept: roleDept.id })
  }
  // 问卷填写群（群组——5 机器人 + 管理员 + 张明——用户进群发消息触发全员）
  const [surveyGroup] = await ins('departments', [{ app_id: DEMO_APP_ID, name: GROUP_NAME, is_dm: false }], { returning: ['id'] })
  await ins('department_members', [
    { department_id: surveyGroup.id, agent_id: adminAgent.id, role: 'admin' },
    { department_id: surveyGroup.id, agent_id: userAgent.id, role: 'member' },
  ])
  for (const r of surveyRoles) {
    await ins('department_members', [{ department_id: surveyGroup.id, agent_id: r.agent, role: 'member' }])
  }
  console.log(`  ✓ 问卷填写群：${GROUP_ROLES.length} 个机器人（财务小王/市场小李/产品老张/客服小陈/研发大刘）——进群 @全员 请填写问卷`)
  console.log(`    问卷页：${SURVEY_URL}——${GROUP_ROLES.length} 个机器人同时响应（各自独立部门沙盒）`)

  // ════════════════════════════════════════════════════
  // 6b. 组织层级：部门经理（department 类型 agent——代表部门对外协作）
  // ════════════════════════════════════════════════════
  // 经理 = 部门代表：加入上级部门（管理委员会）形成组织层级；被 @ 时用 call_agent 分派成员干活
  async function makeManager(deptRow, deptName) {
    const [mgr] = await ins('agents', [{
      app_id: DEMO_APP_ID, type: 'department', name: deptName + '经理', description: '部门经理——代表「' + deptName + '」对外协作',
      model: 'deepseek-v4-flash', department_id: deptRow.id, is_active: true, tools: '[]', allow_file_tools: true,
    }], { returning: ['id', 'name'] })
    await ins('department_members', [{ department_id: deptRow.id, agent_id: mgr.id, role: 'manager' }], { conflict: undefined })
    return mgr
  }
  const devMgr = await makeManager(devDept, '技术部')
  const csMgr = await makeManager(csDept, '客服中心')
  const opsMgr = await makeManager(opsDept, '运维组')
  console.log('  ✓ 部门经理: 技术部经理 / 客服中心经理 / 运维组经理（department 类型——代表部门）')

  // 上级部门「管理委员会」——三个经理加入，形成组织层级（两层）
  const [boardDept] = await ins('departments', [{ app_id: DEMO_APP_ID, name: '管理委员会', is_dm: false }], { returning: ['id'] })
  const boardMgr = await makeManager(boardDept, '管理委员会')
  await ins('department_members', [
    { department_id: boardDept.id, agent_id: adminAgent.id, role: 'admin' },
    { department_id: boardDept.id, agent_id: devMgr.id, role: 'member' },
    { department_id: boardDept.id, agent_id: csMgr.id, role: 'member' },
    { department_id: boardDept.id, agent_id: opsMgr.id, role: 'member' },
  ], { conflict: undefined })
  console.log('  ✓ 管理委员会（上级部门）: 技术部/客服中心/运维组经理加入——两层组织层级')

  // 经理提示词回填（部门成员名单——call_agent 分派用）
  for (const [mgr, deptRow, deptName] of [[devMgr, devDept, '技术部'], [csMgr, csDept, '客服中心'], [opsMgr, opsDept, '运维组'], [boardMgr, boardDept, '管理委员会']]) {
    try {
      const members = await orm.query.from('department_members dm')
        .join('agents a', { 'a.id': { col: 'dm.agent_id' } })
        .select('a.name')
        .where({ 'dm.department_id': { eq: deptRow.id }, 'a.type': { in: ['ai', 'knowledge_base'] }, 'a.id': { ne: mgr.id } })
        .run()
      const names = (members ?? []).map((m) => m.name).join('、')
      await orm.query.update('agents').set({ system_prompt: `你是「${deptName}」的部门经理，代表该部门参与协作。\n\n你的职责：\n1. 作为部门代表回答与其他部门的协作请求\n2. 需要部门成员实际干活时，用 call_agent 工具把任务分派给成员（一次一个成员）\n3. 汇总成员结果后回复——你就是「${deptName}」的对外出口\n\n部门成员：${names || '（暂无 AI 成员——请先给部门添加 AI 能力）'}\n\n任务完成后按以下结构汇报：\n- ✅ 已完成：列出完成的事项\n- ⚠️ 未完成：列出未完成的事项及原因（没有则省略）\n- 📦 产物：生成的文件/结果位置（没有则省略）` }).where({ id: { eq: mgr.id } }).run()
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

  await ins('messages', [
    // 技术部对话
    { department_id: devDept.id, sender_id: userAgent.id, content: '小码，帮我看一下这段代码有什么问题？\n```typescript\nconst data = await fetch("/api/users")\nreturn data\n```', msg_type: 'text', created_at: ago(30) },
    { department_id: devDept.id, sender_id: devAgent.id, content: '这段代码有几个问题：\n\n1. **缺少错误处理** — fetch 可能失败，需要用 try-catch\n2. **没有解析 JSON** — data 是 Response 对象，需要调用 data.json()\n3. **缺少类型定义** — 建议给返回值加类型\n\n改进建议：\n```typescript\ninterface User { id: string; name: string; email: string }\n\nasync function getUsers(): Promise<User[]> {\n  try {\n    const res = await fetch("/api/users")\n    if (!res.ok) throw new Error(HTTP \${res.status})\n    return res.json()\n  } catch (err) {\n    console.error("获取用户列表失败:", err)\n    return []\n  }\n}\n```', msg_type: 'text', created_at: ago(28) },
    { department_id: devDept.id, sender_id: userAgent.id, content: '明白了，谢谢！能帮我跑一下测试吗？', msg_type: 'text', created_at: ago(25) },
    { department_id: devDept.id, sender_id: devAgent.id, content: '✅ 已在部门工作目录完成初始化：\n\n- `README.md` — 项目说明\n- `src/index.ts` — 入口文件\n- `src/utils.ts` — 工具函数\n\n📦 交付物在右侧「交付物（共享目录）」面板可见——你也可以随时让我在共享目录里写文件。', msg_type: 'text', created_at: ago(23) },
    // 客服中心对话
    { department_id: csDept.id, sender_id: userAgent.id, content: '请问如何创建一个 AI 机器人？', msg_type: 'text', created_at: ago(20) },
    { department_id: csDept.id, sender_id: csAgent.id, content: '您好！创建 AI 机器人的步骤如下：\n\n1. 进入 **Agent** 页面，点击"创建 Agent"\n2. 选择一个角色模板（如"开发助手"或"智能客服"）\n3. 填写名称，调整系统提示词\n4. 点击提交即可\n\n更详细的说明可以参考我们的知识库文档。', msg_type: 'text', created_at: ago(18) },
    { department_id: csDept.id, sender_id: userAgent.id, content: '好的，再问一下怎么配置 HITL？', msg_type: 'text', created_at: ago(15) },
    { department_id: csDept.id, sender_id: csAgent.id, content: 'HITL 配置很简单：\n\n1. 在创建或编辑 AI 机器人时，找到「人工审批」开关\n2. 开启后，AI 的回复不会直接发送，而是生成草稿\n3. 管理员在聊天界面会看到审批按钮，可以批准或拒绝\n\n这样可以确保敏感场景下的回复质量。还有其他问题吗？', msg_type: 'text', created_at: ago(13) },
    // 运维组对话
    { department_id: opsDept.id, sender_id: adminAgent.id, content: '小维，收到一条告警：服务器 CPU 负载超过 90%', msg_type: 'text', created_at: ago(10) },
    { department_id: opsDept.id, sender_id: opsAgent.id, content: '⚠️ **收到告警，正在诊断**\n\n1. 已在运维组工作目录放好检查脚本 `scripts/check-disk.sh`（磁盘水位）\n2. 需网络权限才能抓取 CPU 详情——默认沙盒无网络\n\n请确认是否允许我执行诊断命令（bash 在沙盒容器内执行，安全隔离）。', msg_type: 'text', created_at: ago(8) },
    // 张明-小码 单聊
    { department_id: dmDept.id, sender_id: adminAgent.id, content: '小码，帮我写一个 git hook 脚本，在 commit 前自动运行 lint', msg_type: 'text', created_at: ago(5) },
    { department_id: dmDept.id, sender_id: devAgent.id, content: '这是一个 pre-commit hook 脚本：\n\n```bash\n#!/bin/bash\n# .git/hooks/pre-commit\n\n# 运行 ESLint\necho "Running ESLint..."\nnpx eslint . --ext .ts,.tsx\nif [ $? -ne 0 ]; then\n  echo "❌ ESLint 检查未通过，请修复后重新提交"\n  exit 1\nfi\n\n# 运行类型检查\necho "Running Type Check..."\nnpx tsc --noEmit\nif [ $? -ne 0 ]; then\n  echo "❌ 类型检查未通过，请修复后重新提交"\n  exit 1\nfi\n\necho "✅ 所有检查通过"\n```\n\n安装方式：\n```bash\nchmod +x .git/hooks/pre-commit\n```', msg_type: 'text', created_at: ago(3) },
  ])
  console.log('  ✓ 消息历史: 10 条（覆盖 4 个部门）')

  // 7b. 审批待办草稿（Approvals 页数据——HITL 小维生成待审批回复）
  await ins('messages', [
    { department_id: opsDept.id, sender_id: opsAgent.id, content: '[AI 生成中...]', msg_type: 'text', ai_draft: '⚠️ 检测到服务器 cpu 使用率持续高于 85%（已持续 10 分钟）。建议：\n1. 重启 nginx 工作进程释放缓存\n2. 扩容 2 台实例分担负载\n\n请确认是否执行扩容操作。', ai_approved: null, ai_step: '{"steps":["llm"]}', created_at: ago(12) },
    { department_id: opsDept.id, sender_id: opsAgent.id, content: '[AI 生成中...]', msg_type: 'text', ai_draft: '检测到磁盘空间不足（/data 使用率 92%）。建议清理 30 天前的备份文件（约 4.2GB）。请确认清理范围。', ai_approved: null, ai_step: '{"steps":["llm"]}', created_at: ago(5) },
  ])
  console.log('  ✓ 审批待办: 2 条 HITL 草稿（运维组待审批）')

  // ════════════════════════════════════════════════════
  // 7c. 沙盒演示记录（三层模型：sandbox = 计算资源——绑定部门）
  // ════════════════════════════════════════════════════
  // requested = 惰性（容器未起——首次 AI 工具调用自动创建）；
  // 工作台/部门页显示环境状态点「环境待启动（首次干活自动创建）」；
  // network = true（沙盒默认开通网络——AI 工具可访问外部 API/服务）
  await ins('sandboxes', [
    { app_id: DEMO_APP_ID, department_id: devDept.id, name: '技术部', status: 'requested', mode: 'persistent', image: 'ap-sandbox:latest', network: true, memory_mb: 1024, cpus: 1, workspace: devWs },
    { app_id: DEMO_APP_ID, department_id: opsDept.id, name: '运维组', status: 'requested', mode: 'persistent', image: 'ap-sandbox:latest', network: true, memory_mb: 1024, cpus: 1, workspace: opsWs },
  ])
  console.log('  ✓ 沙盒演示记录: 技术部 / 运维组（requested——首次干活自动创建——network 默认开通）')

  // ════════════════════════════════════════════════════
  // 8. Agent 执行日志（Dashboard 面板数据）
  // ════════════════════════════════════════════════════

  await ins('agent_logs', [
    // 小码执行记录
    { agent_id: devAgent.id, app_id: DEMO_APP_ID, department_id: devDept.id, messages_count: 10, steps_count: 2, tokens_prompt: 850, tokens_completion: 420, tokens_total: 1270, elapsed_ms: 3200, success: true, created_at: ago(29) },
    { agent_id: devAgent.id, app_id: DEMO_APP_ID, department_id: devDept.id, messages_count: 15, steps_count: 3, tokens_prompt: 1200, tokens_completion: 680, tokens_total: 1880, elapsed_ms: 5100, success: true, created_at: ago(24) },
    { agent_id: devAgent.id, app_id: DEMO_APP_ID, department_id: dmDept.id, messages_count: 5, steps_count: 1, tokens_prompt: 340, tokens_completion: 180, tokens_total: 520, elapsed_ms: 1800, success: true, created_at: ago(4) },
    // 小应执行记录
    { agent_id: csAgent.id, app_id: DEMO_APP_ID, department_id: csDept.id, messages_count: 8, steps_count: 1, tokens_prompt: 560, tokens_completion: 210, tokens_total: 770, elapsed_ms: 2400, success: true, created_at: ago(19) },
    { agent_id: csAgent.id, app_id: DEMO_APP_ID, department_id: csDept.id, messages_count: 12, steps_count: 1, tokens_prompt: 780, tokens_completion: 340, tokens_total: 1120, elapsed_ms: 3100, success: true, created_at: ago(14) },
    // 小维执行记录（有一次失败）
    { agent_id: opsAgent.id, app_id: DEMO_APP_ID, department_id: opsDept.id, messages_count: 6, steps_count: 3, tokens_prompt: 980, tokens_completion: 560, tokens_total: 1540, elapsed_ms: 4500, success: true, created_at: ago(9) },
    { agent_id: opsAgent.id, app_id: DEMO_APP_ID, department_id: opsDept.id, messages_count: 3, steps_count: 2, tokens_prompt: 420, tokens_completion: 0, tokens_total: 420, elapsed_ms: 12000, success: false, created_at: ago(7) },
  ])
  console.log('  ✓ Agent 执行日志: 7 条（含 1 条失败记录）')

  // ════════════════════════════════════════════════════
  // 9. Webhook 调用日志
  // ════════════════════════════════════════════════════

  await ins('webhook_logs', [
    { agent_id: webhookAgent.id, app_id: DEMO_APP_ID, request_body: '{"event":"deploy","status":"success"}', response_body: '{"reply":"部署成功通知已收到"}', response_status: 200, elapsed_ms: 1200, success: true, created_at: ago(60) },
    { agent_id: webhookAgent.id, app_id: DEMO_APP_ID, request_body: '{"event":"monitor","alert":"cpu_high"}', response_body: '{"reply":"告警已记录，已通知运维组"}', response_status: 200, elapsed_ms: 980, success: true, created_at: ago(30) },
    { agent_id: webhookAgent.id, app_id: DEMO_APP_ID, request_body: '{"event":"deploy","status":"failed"}', response_body: '{"reply":"部署失败通知已收到"}', response_status: 200, elapsed_ms: 1500, success: true, created_at: ago(15) },
  ])
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
  const [boss] = await ins('_weifuwu_users', [{ email: 'boss@acme.local', name: '王总', password_hash: bossPassword, role: 'member' }], { conflict: 'email', update: true, returning: ['id', 'name'] })
  const [staff] = await ins('_weifuwu_users', [{ email: 'staff@acme.local', name: '小林', password_hash: staffPassword, role: 'member' }], { conflict: 'email', update: true, returning: ['id', 'name'] })
  await ins('_weifuwu_apps', [{ id: ACME_APP_ID, slug: 'acme', name: '星辰科技', owner_user_id: boss.id, plan: 'free', trial_ends_at: new Date(Date.now() + 10 * 86_400_000).toISOString(), monthly_token_limit: 50000 }], { conflict: 'id', update: true })
  await ins('_weifuwu_app_members', [
    { app_id: ACME_APP_ID, user_id: boss.id, role: 'owner', invited_by: boss.id },
    { app_id: ACME_APP_ID, user_id: staff.id, role: 'member', invited_by: boss.id },
  ], { conflict: undefined })
  const [bossAgent] = await ins('agents', [{ app_id: ACME_APP_ID, type: 'user', name: boss.name, user_id: boss.id, is_active: true }], { returning: ['id'] })
  const [staffAgent] = await ins('agents', [{ app_id: ACME_APP_ID, type: 'user', name: staff.name, user_id: staff.id, is_active: true }], { returning: ['id'] })
  const [acmeAi] = await ins('agents', [{
    app_id: ACME_APP_ID, type: 'ai', name: '小星', description: '产品咨询助手', model: 'deepseek-v4-flash',
    system_prompt: '你是星辰科技的产品助手，回答简洁准确。', temperature: 0.7, max_tokens: 2048, is_active: true, tools: '[]',
  }], { returning: ['id'] })
  const [acmeDept] = await ins('departments', [{ app_id: ACME_APP_ID, name: '产品咨询组', is_dm: false }], { returning: ['id'] })
  await ins('department_members', [
    { department_id: acmeDept.id, agent_id: bossAgent.id, role: 'admin' },
    { department_id: acmeDept.id, agent_id: staffAgent.id, role: 'member' },
    { department_id: acmeDept.id, agent_id: acmeAi.id, role: 'member' },
  ])
  await ins('messages', [
    { department_id: acmeDept.id, sender_id: staffAgent.id, content: '小星，我们产品的试用期是多久？', msg_type: 'text', created_at: ago(120) },
    { department_id: acmeDept.id, sender_id: acmeAi.id, content: '我们提供 14 天免费试用，支持 5 万 token 用量。升级 Pro 后额度提升至 100 万。', msg_type: 'text', created_at: ago(110) },
  ])
  await ins('agent_logs', [{ agent_id: acmeAi.id, app_id: ACME_APP_ID, department_id: acmeDept.id, messages_count: 6, steps_count: 1, tokens_prompt: 420, tokens_completion: 210, tokens_total: 630, elapsed_ms: 2400, success: true, created_at: ago(100) }])
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
  console.log('    8. 「问卷填写群」：发消息 @全员 请填写问卷——5 个机器人（财务小王/市场小李/产品老张/客服小陈/研发大刘）同时响应——统计页 http://localhost:3000/demo-survey/stats 实时查看')
}

main().catch((err) => {
  console.error('[seed] 失败:', err)
  process.exit(1)
})
