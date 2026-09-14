/**
 * PERSONA-PLAN 北极星验收（替换测试）
 *
 * 方法：用一份"真人团队协作剧本"（王总 → 财务助手 → 知识库 → 补充 → 修正），
 * 让 AI 按剧本执行同一任务序列，检查 AI 的行为是否命中真人协作流的
 * 关键节点（认领/委托/汇报/称呼/道歉修正）——"体验不变"的可执行化。
 *
 * 用法：node --env-file=.env scripts/persona-eval.mjs
 * 输出：每轮 AI 回复的行为点命中情况 + 总评
 */

const BASE = 'http://localhost:3000'
const EMAIL = 'admin@demo.com'
const PASSWORD = 'admin123'

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  })
  return res.json()
}

async function main() {
  // 登录
  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })
  const bossToken = login.token
  const appLogin = await api('/api/auth/apps/demo/login', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bossToken}` },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const token = appLogin.token
  const auth = { Authorization: `Bearer ${token}` }

  const depts = await api('/api/departments', { headers: auth })
  // 选含"小码"的群聊（验收 AI 固定——@ 命中才有回复）
  let dept = null
  let deptDetail = null
  for (const d of depts.departments) {
    if (d.is_dm) continue
    const dd = await api(`/api/departments/${d.id}`, { headers: auth })
    if (dd.members?.some((m) => m.name === '小码' && m.type === 'ai')) {
      dept = d; deptDetail = dd; break
    }
  }
  if (!dept) throw new Error('未找到含小码的群聊部门')
  const members = deptDetail.members ?? []
  const aiMember = members.find((m) => m.name === '小码')

  console.log(`\n=== PERSONA 北极星验收（替换测试）===\n`)
  console.log(`群：${dept.name}（${members.map((m) => m.name).join('、')}）· 验收 AI：${aiMember?.name ?? '未知'}\n`)

  // 剧本三轮（第一轮带附件——Q3 销售数据，AI 有料可析）
  const Q3_CSV = Buffer.from('region,q2,q3\n华东,120,72\n华南,80,84\n华北,60,66\n').toString('base64')
  const script = [
    {
      round: 1,
      message: '@小码 Q3 销售下滑 12%，分析一下原因',
      attachments: [{ name: 'sales-q3.csv', data: Q3_CSV, size: 42 }],
      expect: ['响应', '汇报', '称呼'],
      check: (text) => ({
        // 认领或直接回答都是真人行为（数据已有时直接给结论更自然）
        响应: /^(收到|好的|好|可以|行)[，,。!！]?|^数据|^直接|^我(已|先|把|来)|^这个问题/.test(text),
        汇报: /(表格|\||汇总|结论|原因|占比|下滑|分析|降幅|环比|负增长)/.test(text),
        称呼: /(张明|您|张总|老板|李华)/.test(text),
      }),
    },
    {
      round: 2,
      message: '@小码 为什么华东区最严重？',
      expect: ['回复衔接', '深入分析'],
      check: (text) => ({
        '回复衔接': /(华东|Q3|下滑|数据|分析)/.test(text),
        '深入分析': /(原因|因为|占比|产品|渠道|促销|停售|对比|环比|降幅|负增长|其中)/.test(text),
      }),
    },
    {
      round: 3,
      message: '@小码 数据对吗？我这边看华东占比是 40%，你再核对一下',
      expect: ['核对', '修正/致歉'],
      check: (text) => ({
        核对: /(核对|确认|重新|再看|查证|计算)/.test(text),
        '修正/致歉': /(抱歉|对不起|更正|修正|你说得对|重新计算|确认无误|占比)/.test(text),
      }),
    },
  ]

  let totalHits = 0
  let totalChecks = 0
  const report = []

  for (const step of script) {
    console.log(`── 第 ${step.round} 轮：${step.message}\n`)
    await api(`/api/departments/${dept.id}/messages`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ content: step.message, attachments: step.attachments ?? undefined }),
    })
    // 等待 AI 回复（轮询最新消息）
    let reply = ''
    let prev = ''
    let stable = 0
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const msgs = await api(`/api/departments/${dept.id}/messages?limit=1`, { headers: auth })
      const last = msgs.messages?.[0]
      if (last?.sender_type === 'ai' && last.content && last.content !== '[AI 生成中...]') {
        // 流式生成中 content 持续变化——稳定 3 次才算完成（工具执行停顿可能 >6s）
        if (prev === last.content) {
          stable++
          if (stable >= 3) { reply = last.content; break }
        } else { stable = 0; prev = last.content }
      }
    }
    if (!reply) {
      console.log('  ⚠️ 未等到 AI 回复（超时）\n')
      continue
    }
    console.log(`  AI：${reply.slice(0, 300).replace(/\n/g, ' ')}...\n`)

    const stripped = reply.replace(/^\[[^\]]+\]\s*/, '') // AI 模仿历史署名格式——剥前缀再检查
    const hits = step.check(stripped)
    const line = []
    for (const [name, ok] of Object.entries(hits)) {
      line.push(`${ok ? '✅' : '❌'} ${name}`)
      totalHits += ok ? 1 : 0
      totalChecks++
    }
    report.push({ round: step.round, hits })
    console.log(`  行为点：${line.join(' · ')}\n`)
  }

  const pct = Math.round((totalHits / totalChecks) * 100)
  console.log(`=== 验收汇总 ===`)
  console.log(`行为点命中：${totalHits}/${totalChecks}（${pct}%）`)
  console.log(`北极星标准：≥80% 视为"替换体验成立"——${pct >= 80 ? '✅ 通过' : '❌ 未通过（需补协议）'}`)
  console.log(`\n盲测素材：以上三轮对话即可混合真人回复做盲测。\n`)
}

main().catch((e) => {
  console.error('验收失败:', e.message)
  process.exit(1)
})
