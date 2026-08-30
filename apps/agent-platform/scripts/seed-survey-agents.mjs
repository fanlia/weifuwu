/**
 * 模拟数据收集——10 个不同人设的 AI 角色批量创建（新架构适配 2026-12）
 *
 * 三层模型：每角色一个独立部门 = 独立沙盒 = **并发填写**（旧实现 1 部门 10 agent 在新架构
 * 下会走沙盒 exec 串行队列——浏览器任务排队数十分钟——架构不变量，按角色拆部门解决）。
 *
 * 角色流程（提示词内建）：agent-browser 打开问卷 → snapshot 读题 → fill/select/check 作答
 * → submit 提交 → 验证成功 → 结果写入部门工作目录 survey-result.json（交付物+执行验证可见）
 *
 * 用法：
 *   node --env-file=.env scripts/seed-survey-agents.mjs                    # 10 人设（内置——默认）
 *   node --env-file=.env scripts/seed-survey-agents.mjs --count=100       # 10 人设取前 N（≤10）
 *   node --env-file=.env scripts/seed-survey-agents.mjs --matrix=10x10x10 --count=1000
 *       # 矩阵人设（行业×职级×性格——1000 唯一组合）——命名规约 问卷-{行业}-{职级}-{性格}
 *   （matrix 不带 count = 全量矩阵人设；batch=50 批建——进度日志——幂等可续跑）
 * 前置：服务启动（admin@demo.com 可登录）；问卷页 {PUBLIC_BASE_URL}/demo-survey
 */

const BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.com'
const PASSWORD = process.env.SEED_PASSWORD ?? 'admin123'
const SURVEY_URL = process.env.SURVEY_URL ?? `${BASE}/demo-survey`

const PERSONAS = [
  { name: '财务小王', roleLabel: '财务视角', expertise: '成本/预算/ROI', prompt: '你是财务部的小王，35 岁，关注成本与预算。填问卷时：对价格敏感，倾向低分，反馈聚焦性价比与 ROI。回答简洁务实。' },
  { name: '市场小李', roleLabel: '市场视角', expertise: '品牌/渠道/增长', prompt: '你是市场部的小李，28 岁，关注品牌与增长。填问卷时：乐观积极，给高分，反馈聚焦品牌传播与市场活动。语气热情。' },
  { name: '产品老张', roleLabel: '产品视角', expertise: '体验/功能/roadmap', prompt: '你是产品经理老张，38 岁，关注体验与功能。填问卷时：评分中等偏上，反馈聚焦易用性与功能缺口，给具体改进建议。' },
  { name: '客服小陈', roleLabel: '客服视角', expertise: '售后/响应/满意度', prompt: '你是客服主管小陈，30 岁，关注售后响应。填问卷时：评分取决于售后体验的想象，反馈聚焦响应速度与服务态度。' },
  { name: '研发大刘', roleLabel: '技术视角', expertise: '性能/安全/架构', prompt: '你是技术负责人大刘，40 岁，关注性能与安全。填问卷时：评分保守（3-4），反馈聚焦技术稳定性、安全性与性能指标。' },
  { name: '人事小周', roleLabel: 'HR 视角', expertise: '制度/培训/文化', prompt: '你是 HR 小周，32 岁，关注制度与培训。填问卷时：中性评分，反馈聚焦培训支持与制度清晰度。语气温和。' },
  { name: '销售阿强', roleLabel: '销售视角', expertise: '客户/渠道/成交', prompt: '你是销售总监阿强，42 岁，关注客户反馈与成交。填问卷时：给高分（维护关系心态），反馈聚焦客户痛点与销售支持。' },
  { name: '运营小赵', roleLabel: '运营视角', expertise: '数据/流程/效率', prompt: '你是运营小赵，27 岁，关注数据与效率。填问卷时：评分中等，反馈聚焦数据看板与流程效率，给具体数据建议。' },
  { name: '行政陈姐', roleLabel: '行政视角', expertise: '后勤/合规/流程', prompt: '你是行政主管陈姐，45 岁，关注合规与流程。填问卷时：评分中性偏稳，反馈聚焦流程规范与后勤支持。' },
  { name: '实习生阿泽', roleLabel: '新人视角', expertise: '上手/引导/文档', prompt: '你是实习生阿泽，22 岁，刚入职。填问卷时：评分看上手体验，反馈聚焦新人引导与文档质量。语气青涩真诚。' },
]

/* ── 人设参数（S0——2027-09——10 测试 → 1000 生产） ── */
const argv = process.argv.slice(2)
const argOf = (k, d) => {
  // 支持 --key=value 与 --key value 两种形式
  const eq = argv.find((a) => a.startsWith(`${k}=`))
  if (eq !== undefined) return eq.slice(k.length + 1)
  const i = argv.indexOf(k)
  return i === -1 ? d : (argv[i + 1] ?? d)
}
const COUNT = parseInt(argOf('--count', '10'), 10) || 10
const MATRIX = argOf('--matrix', '')          // '10x10x10'——行业×职级×性格
const BATCH = parseInt(argOf('--batch', '50'), 10) || 50

/** 行业轴（关注面/反馈面——prompt 模板化） */
const INDUSTRIES = [
  { name: '互联网', focus: '产品体验与创新速度' }, { name: '金融', focus: '安全合规与收益' },
  { name: '制造', focus: '生产效率与质量' }, { name: '教育', focus: '教学效果与师资' },
  { name: '医疗', focus: '专业安全与服务' }, { name: '零售', focus: '商品丰富与价格' },
  { name: '物流', focus: '时效与配送体验' }, { name: '能源', focus: '成本与可持续' },
  { name: '建筑', focus: '质量与工期' }, { name: '农业', focus: '收成与价格' },
]
/** 职级轴（年龄映射） */
const LEVELS = [
  { name: '实习生', age: 22 }, { name: '专员', age: 26 }, { name: '主管', age: 32 },
  { name: '经理', age: 38 }, { name: '总监', age: 45 }, { name: 'VP', age: 50 },
  { name: '创始人', age: 44 }, { name: '顾问', age: 40 }, { name: '自由职业', age: 35 }, { name: '退休', age: 60 },
]
/** 性格轴（评分倾向/语气——人设差异的确定性来源） */
const TRAITS = [
  { name: '谨慎', score: '倾向低分（2-3），重视风险与稳健', tone: '话不多，慎重保守' },
  { name: '乐观', score: '给高分（4-5），看到积极面', tone: '语气积极热情' },
  { name: '保守', score: '倾向低分（2-3），不轻易满意', tone: '语气平稳，不出彩' },
  { name: '热情', score: '给高分（4-5），乐于肯定', tone: '语气热情洋溢' },
  { name: '中立', score: '中等评分（3），客观理性', tone: '语气平稳客观' },
  { name: '挑剔', score: '倾向低分（2-3），高标准严要求', tone: '语气严格，爱挑细节' },
  { name: '随和', score: '给高分（4-5），容易满意', tone: '语气随和友善' },
  { name: '理性', score: '中等评分（3-4），看数据说话', tone: '语气条理清晰' },
  { name: '感性', score: '中等偏上（3-4），看感受与细节', tone: '语气真诚走心' },
  { name: '务实', score: '中等评分（3-4），看实际效果', tone: '语气直接高效' },
]

/** 矩阵人设生成（唯一组合——网格遍历——count 截断） */
function matrixPersonas(count) {
  const [ni, nl, nt] = MATRIX.split('x').map((x) => parseInt(x, 10) || 10)
  const out = []
  for (let i = 0; i < ni && out.length < count; i++) {
    for (let l = 0; l < nl && out.length < count; l++) {
      for (let t = 0; t < nt && out.length < count; t++) {
        const ind = INDUSTRIES[i % INDUSTRIES.length]
        const lv = LEVELS[l % LEVELS.length]
        const tr = TRAITS[t % TRAITS.length]
        const name = `问卷-${ind.name}-${lv.name}-${tr.name}`
        out.push({
          name,
          roleLabel: `${lv.name}视角`,
          expertise: `${ind.focus}/${tr.name}`,
          prompt: `你是${ind.name}行业的${lv.name}（${lv.age} 岁），性格${tr.name}。关注${ind.focus}。填问卷时：${tr.score}，反馈聚焦${ind.focus}。${tr.tone}。`,
        })
      }
    }
  }
  return out
}

/** 人设池（matrix 显式 → 矩阵生成；否则内置 10 人设） */
const PERSONA_POOL = MATRIX ? matrixPersonas(COUNT) : PERSONAS.slice(0, Math.min(COUNT, PERSONAS.length))

/** 调度助手系统提示词（S2——批量问卷入口——用户聊天触发 -> 助手调工具） */
function buildDispatcherPrompt() {
  return `你是「问卷助手」——负责批量问卷任务的组织与汇报（平台内置调度 agent）。

当用户要求填写问卷（如「让 1000 人填问卷」「模拟 30 个用户答题」）时：
1. 解析意图：总量 N（--total）、并发 K（同时在线——未说明用 5）、问卷链接（未给用默认）
2. 用 survey_campaign_start 启动（参数：total/concurrency/url——明确传达）
3. 启动后向用户告知：任务已启动（总量 N/并发 K）——可随时问进度
4. 用户问进度（「填到哪了/完成了吗」）→ survey_campaign_status 查询并简明汇报：
   完成 N/M · 失败 K · 在线 X——有失败给清单并建议重跑
5. 用户同意重跑 → survey_campaign_retry（失败角色重新排队）
6. 完成时给出统计（完成率/失败清单）

【纪律】
- 进度一律以 survey_campaign_status 查询结果为准——不编造
- 问卷 URL 未提供时传空（用默认问卷页）
- 普通咨询/闲聊直接回复——不强制调工具
- 并发 K 参考沙盒池容量（默认 5——用户指定则尊重）`
}

/** 问卷填写群——5 个机器人的群组（seed 自动建好：用户进群发消息 @全员/@all，
 *  5 个机器人同时响应填写问卷——自然使用路径，无需跑 launch 派单） */
const GROUP_NAME = '问卷填写群'
const GROUP_ROLES = PERSONAS.slice(0, 5) // 财务小王/市场小李/产品老张/客服小陈/研发大刘

/** 角色执行提示词：人设 + agent-browser 填写纪律 + 结果落盘（交付物） */
// 容器内可达宿主地址（2027-09：沙盒容器 --add-host host.docker.internal:host-gateway
// 已配——localhost=容器自身；宿主 IP 会漂移——不硬编码——env 可覆盖）
const SURVEY_HOST_URL = process.env.SURVEY_CONTAINER_URL ?? 'http://host.docker.internal:3000'
function buildSurveyPrompt(p) {
  return `${p.prompt}

【问卷填写任务（模拟数据收集）——硬性契约】
当收到问卷任务时——必须真实执行以下操作链——禁止仅描述/脑补输出（实证：
只描述不执行 = 任务超时失败——历史教训）：
1. 用 bash 工具执行：agent-browser open "${SURVEY_HOST_URL}/demo-survey?s=${encodeURIComponent(p.name)}"
   ⚠️ 容器内访问：localhost 是容器自身（问卷连不上）——用宿主地址：
   agent-browser open "${SURVEY_HOST_URL}/demo-survey?s=${encodeURIComponent(p.name)}"
   （你的沙盒 allow_network 已开启——网络可用——工具描述里的「默认无网络」不适用于你）
2. bash 工具执行：agent-browser snapshot ——真实读取题目与控件 ref
   （每步的输出必须是 bash 工具的真实返回——没有工具返回 = 没有执行 = 继续失败）
3. 逐题作答（bash 工具执行）：click "@eXX"（年龄/关注/评分单选）+ 下拉选行业 +
   文本框 type 反馈——每题执行后 snapshot 确认控件已选中
4. bash 工具执行：点击提交按钮（click 提交）
5. bash 工具执行：agent-browser read/snapshot 验证 ——页面必须显示「✅ 已提交——不可修改」
   锁定态——看到锁定态才算完成（完成判定以服务端收到提交为准——锁定态是唯一真实信号）
6. 确认锁定态后：write 工具写 survey-result.json（覆盖）：
   {"name":"${p.name}","role":"${p.roleLabel}","submitted":true,"answers":{...逐题答案...},"verified":true}
   然后 agent-browser close
7. 最后回复消息：报告真实的提交编号与锁定态——未看到锁定态前不得报告完成

【纪律】每一步工具调用必须真实发生；工具失败（连接失败/控件缺失）要如实报告
并重试——禁止编造「页面已打开/已读取/已提交」——编造 = 任务失败。`
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    body: opts.body === undefined ? undefined : (typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)),
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`)
  return data
}

async function main() {
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const appLogin = await api('/api/auth/apps/demo/login', {
    method: 'POST', headers: { Authorization: `Bearer ${login.token}` }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const token = appLogin.token
  const auth = { Authorization: `Bearer ${token}` }

  const depts = await api('/api/departments', { headers: auth })
  const existingDepts = new Map(depts.departments.map((d) => [d.name, d.id]))
  const agents = await api('/api/agents', { headers: auth })
  const existingAgents = new Map(agents.agents.map((a) => [a.name, a]))

  // 「问卷填写群」——5 个机器人的群组（seed 自动建好——用户进群发消息 @全员 → 全部填写问卷）
  let groupDeptId = existingDepts.get(GROUP_NAME)
  if (!groupDeptId) {
    const d = await api('/api/departments', { method: 'POST', headers: auth, body: JSON.stringify({ name: GROUP_NAME, auto_manager: false }) })
    groupDeptId = d.department.id
    existingDepts.set(GROUP_NAME, groupDeptId)
  }

  // 「问卷调研」部门——用户在部门里发消息（@全员 或 @角色）让大家填写（自然使用路径）
  let hubDeptId = existingDepts.get('问卷调研')
  if (!hubDeptId) {
    const d = await api('/api/departments', { method: 'POST', headers: auth, body: JSON.stringify({ name: '问卷调研', auto_manager: false }) })
    hubDeptId = d.department.id
    existingDepts.set('问卷调研', hubDeptId)
  }

  // S2：「问卷调度」部门 + 问卷助手（批量任务入口——用户 @问卷助手 让 N 人填问卷）
  let dispatchDeptId = existingDepts.get('问卷调度')
  if (!dispatchDeptId) {
    const d = await api('/api/departments', { method: 'POST', headers: auth, body: JSON.stringify({ name: '问卷调度', auto_manager: false }) })
    dispatchDeptId = d.department.id
    existingDepts.set('问卷调度', dispatchDeptId)
  }
  let dispatcher = existingAgents.get('问卷助手')
  if (!dispatcher) {
    const a = await api('/api/agents', { method: 'POST', headers: auth, body: {
      type: 'ai', name: '问卷助手', description: '批量问卷任务调度——启动/进度/重跑',
      role_label: '问卷调度', expertise: '批量问卷/并发控制/进度汇报',
      system_prompt: buildDispatcherPrompt(), allow_file_tools: false, allow_command_exec: false,
      allow_network: false, human_in_the_loop: false, department_id: dispatchDeptId,
    } })
    dispatcher = a.agent ?? a
    existingAgents.set('问卷助手', dispatcher)
  }
  await api(`/api/departments/${dispatchDeptId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ agent_id: dispatcher.id }) })
    .catch((e) => console.log(`  ⚠️ 助手入组失败: ${e.message}`))
  console.log(`✅ 问卷助手（调度入口）——部门=问卷调度——用户 @问卷助手 让 N 人填问卷`)

  let created = 0
  const total = PERSONA_POOL.length
  for (let pi = 0; pi < total; pi++) {
    const p = PERSONA_POOL[pi]
    if (pi > 0 && pi % BATCH === 0) {
      console.log(`  … 批进度 ${pi}/${total}（已建 ${created}）——批间小歇（不轰击 API）`)
      await new Promise((r) => setTimeout(r, 300))
    }
    // 1) 角色部门（每角色独立部门 = 独立沙盒——并发填写）
    let deptId = existingDepts.get(p.name)
    if (!deptId) {
      const d = await api('/api/departments', { method: 'POST', headers: auth, body: JSON.stringify({ name: p.name, auto_manager: false }) })
      deptId = d.department.id
      existingDepts.set(p.name, deptId)
    }
    // 2) 角色 agent（人设 + 网络权限——浏览器填写）
    let agent = existingAgents.get(p.name)
    if (!agent) {
      const a = await api('/api/agents', { method: 'POST', headers: auth, body: {
        type: 'ai', name: p.name, description: `${p.roleLabel}——${p.expertise}`,
        role_label: p.roleLabel, expertise: p.expertise,
        system_prompt: buildSurveyPrompt(p),
        allow_file_tools: true, allow_command_exec: true, allow_network: true,
        human_in_the_loop: false,
        // 执行归属：角色在自己的独立部门干活（在问卷调研被 @ 时工具走自己的沙盒——并发）
        department_id: deptId,
      } })
      agent = a.agent ?? a
      existingAgents.set(p.name, agent)
    } else {
      // 已存在角色——更新 system_prompt（agent-browser 改可选工具后 prompt 已变——
      // 复用不更新会保留旧强制版——普通对话被逼去开浏览器）
      const updated = await api(`/api/agents/${agent.id}`, { method: 'PUT', headers: auth, body: { system_prompt: buildSurveyPrompt(p), department_id: agent.department_id ?? deptId } })
      agent = updated.agent ?? agent
      console.log(`  ↻ ${p.name} prompt 已更新（agent-browser 可选工具）`)
    }
    // 3) 入组：角色自己的部门 + 问卷调研（用户发消息的入口）
    await api(`/api/departments/${deptId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ agent_id: agent.id }) })
      .catch((e) => console.log(`  ⚠️ 入组失败 ${p.name}: ${e.message}`))
    await api(`/api/departments/${hubDeptId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ agent_id: agent.id }) })
      .catch((e) => console.log(`  ⚠️ 入问卷调研失败 ${p.name}: ${e.message}`))
    // 群组 5 机器人入「问卷填写群」
    if (GROUP_ROLES.some((r) => r.name === p.name)) {
      await api(`/api/departments/${groupDeptId}/members`, { method: 'POST', headers: auth, body: JSON.stringify({ agent_id: agent.id }) })
        .catch((e) => console.log(`  ⚠️ 入问卷填写群失败 ${p.name}: ${e.message}`))
    }
    created++
    console.log(`✅ ${p.name}（${p.roleLabel}）——角色部门=${deptId.slice(0, 8)} agent=${String(agent.id).slice(0, 8)} 已入「问卷调研」`)
  }

  console.log(`\n完成：${created}/${total} 个角色部门 + agent（每角色独立沙盒——并发填写）`)
  console.log(`问卷页：${SURVEY_URL}`)
  if (MATRIX) console.log(`矩阵人设：${MATRIX.split('x').slice(0, 3).map((x) => parseInt(x, 10) || 10).join('×')}（${total} 个——命名 问卷-{行业}-{职级}-{性格}——列表页可按前缀过滤）`)
  console.log(`\n【问卷填写群（seed 自动建好——5 个机器人）】`)
  console.log(`进入「${GROUP_NAME}」→ 发消息 @全员 请填写问卷——${GROUP_ROLES.length} 个机器人同时响应（各自独立沙盒并发）——无需跑 launch 派单`)
  console.log(`\n【10 角色批量派单（可选）】`)
  console.log(`POST /demo-survey/launch 或进入「问卷调研」部门发消息 @全员——10 个角色同时响应`)
  console.log(`汇总：node --env-file=.env scripts/survey-summary.mjs`)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
