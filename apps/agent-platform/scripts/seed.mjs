#!/usr/bin/env node
/**
 * 种子数据脚本 — 测试数据灌入（幂等）
 *
 * 用法: node --env-file=.env apps/agent-platform/scripts/seed.mjs
 */

const BASE = 'http://localhost:3000'

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`)
  return data
}

async function seed() {
  // 1. 尝试注册，已存在则登录
  let token
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'browser@test.com', password: 'pass123', name: 'Browser Tester' }),
  })
  const regData = await regRes.json()
  if (regRes.ok) {
    token = regData.token
    console.log('✅ 用户:', regData.user.email, '(新建)')
  } else {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'browser@test.com', password: 'pass123' }),
    })
    const loginData = await loginRes.json()
    if (!loginRes.ok) throw new Error('登录失败: ' + loginData.error)
    token = loginData.token
    console.log('✅ 用户:', 'browser@test.com', '(已存在)')
  }

  // 2. 创建公司（幂等：已存在则跳过报错）
  const cRes = await fetch(`${BASE}/api/companies`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '测试公司' }),
  })
  let companyId
  if (cRes.ok) {
    companyId = (await cRes.json()).company.id
    console.log('✅ 公司:', companyId, '(新建)')
  } else {
    const existing = await fetch(`${BASE}/api/companies`, { headers: { Authorization: `Bearer ${token}` } })
    const { companies } = await existing.json()
    companyId = companies?.[0]?.id
    if (!companyId) throw new Error('无法获取或创建公司')
    console.log('✅ 公司:', companyId, '(已存在)')
  }

  // 3. 创建 AI Agent（幂等）
  let aiId
  { const res = await fetch(`${BASE}/api/agents`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'ai', name: '智能客服', system_prompt: '你是一个专业的客服助手，耐心回答用户问题。' }),
  })
  if (res.ok) { aiId = (await res.json()).agent.id; console.log('✅ AI Agent:', aiId, '(新建)') }
  else { console.log('⚠ AI Agent 创建失败:', (await res.json()).error) }
  }
  // 获取现有的 AI agent
  if (!aiId) {
    const ag = await fetch(`${BASE}/api/agents`, { headers: { Authorization: `Bearer ${token}` } })
    const { agents } = await ag.json()
    const ai = agents?.find((a) => a.type === 'ai')
    if (ai) { aiId = ai.id; console.log('✅ AI Agent:', aiId, '(已存在)') }
    else { console.log('⚠ 无 AI Agent，跳过') }
  }

  // 4. 创建 Webhook Agent
  let whId
  { const res = await fetch(`${BASE}/api/agents`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'webhook', name: '通知机器人', webhook_url: 'https://example.com/hook', description: '企业微信通知集成' }),
  })
  if (res.ok) { whId = (await res.json()).agent.id; console.log('✅ Webhook:', whId, '(新建)') }
  else { console.log('⚠ Webhook 创建失败:', (await res.json()).error) }
  }

  // 5. 创建知识库 Agent
  let kbId
  { const res = await fetch(`${BASE}/api/agents`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'knowledge_base', name: '产品文档库', description: '产品手册知识库' }),
  })
  if (res.ok) { kbId = (await res.json()).agent.id; console.log('✅ KB:', kbId, '(新建)') }
  else { console.log('⚠ KB 创建失败:', (await res.json()).error) }
  }

  // 6. 创建部门
  const memberIds = [aiId, whId, kbId].filter(Boolean)
  let deptId
  { const res = await fetch(`${BASE}/api/departments`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_id: companyId, name: '客服部门', member_ids: memberIds }),
  })
  if (res.ok) { deptId = (await res.json()).department.id; console.log('✅ 部门:', deptId, '(新建)') }
  else { console.log('⚠ 部门创建失败:', (await res.json()).error) }
  }

  // 7. 确认 user agent
  const ag = await fetch(`${BASE}/api/agents`, { headers: { Authorization: `Bearer ${token}` } })
  const { agents } = await ag.json()
  const userAgent = agents?.find((a) => a.type === 'user')
  console.log('✅ User Agent:', userAgent?.id ?? '未找到')
  console.log(`   共 ${agents?.length ?? 0} 个 Agent`)

  // 8. 部门列表
  const dp = await fetch(`${BASE}/api/departments`, { headers: { Authorization: `Bearer ${token}` } })
  const { departments } = await dp.json()
  console.log(`   共 ${departments?.length ?? 0} 个部门`)

  console.log('\n🎉 种子数据完成!')
  console.log('   登录: browser@test.com / pass123')
}

seed().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
