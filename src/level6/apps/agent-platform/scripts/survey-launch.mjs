/**
 * 问卷派单 + 完成监控（新架构 2026-12）
 *
 * 三层模型：10 个角色各在独立部门（独立沙盒）——派单 = 对每个角色部门发消息
 * （并发 POST——各部门沙盒同时执行浏览器任务，互不排队）。
 * 完成判定：各部门工作目录出现 survey-result.json（AI 写的结果交付物）。
 *
 * 用法：node --env-file=.env scripts/survey-launch.mjs
 * 参数：--watch（派单后监控直到 10/10 或超时——默认只派单）
 */

const BASE = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000'
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.com'
const PASSWORD = process.env.SEED_PASSWORD ?? 'admin123'
const WATCH = process.argv.includes('--watch')
const TIMEOUT_MS = 15 * 60 * 1000 // 15 分钟上限

const ROLES = ['财务小王', '市场小李', '产品老张', '客服小陈', '研发大刘', '人事小周', '销售阿强', '运营小赵', '行政陈姐', '实习生阿泽']

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`)
  return data
}

async function main() {
  // 登录（应用 token——消息发送需要 app 上下文）
  const login = await api('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
  const appLogin = await api('/api/auth/apps/demo/login', {
    method: 'POST', headers: { Authorization: `Bearer ${login.token}` }, body: { email: EMAIL, password: PASSWORD },
  })
  const auth = { Authorization: `Bearer ${appLogin.token}` }

  // 找角色部门（部门名 = 角色名）
  const depts = await api('/api/departments', { headers: auth })
  const deptMap = new Map()
  for (const d of depts.departments) {
    if (ROLES.includes(d.name) && !d.is_dm) deptMap.set(d.name, d.id)
  }
  const missing = ROLES.filter((r) => !deptMap.has(r))
  if (missing.length > 0) {
    console.error(`❌ 缺少角色部门：${missing.join('、')}——先跑 seed-survey-agents.mjs`)
    process.exit(1)
  }
  console.log(`✅ 找到 ${deptMap.size} 个角色部门\n`)

  // 并发派单（每角色部门发消息——@角色 触发其填写）
  const content = (name) => `@${name} 请开始填写问卷（${BASE}/demo-survey?s=${encodeURIComponent(name)}）——按你的人设作答并提交，完成后写 survey-result.json 到工作目录并关闭浏览器。`
  const results = await Promise.allSettled(
    ROLES.map((name) => api(`/api/departments/${deptMap.get(name)}/messages`, {
      method: 'POST', headers: auth, body: { content: content(name) },
    })),
  )
  const sent = results.filter((r) => r.status === 'fulfilled').length
  const failed = results.filter((r) => r.status === 'rejected')
  console.log(`📤 派单完成：${sent}/10 成功${failed.length > 0 ? `（失败 ${failed.length}：${failed.map((f) => (f.reason as Error).message).join('；')}）` : ''}`)

  if (!WATCH) {
    console.log('\n监控完成情况：node --env-file=.env scripts/survey-launch.mjs --watch')
    process.exit(0)
  }

  // 监控：轮询各部门工作目录 survey-result.json（走文件浏览器 API——部门交付物）
  console.log(`\n📡 监控填写进度（超时 ${Math.round(TIMEOUT_MS / 60000)} 分钟）...`)
  const done = new Set()
  const start = Date.now()
  const timer = setInterval(async () => {
    const elapsed = Math.round((Date.now() - start) / 1000)
    try {
      for (const name of ROLES) {
        if (done.has(name)) continue
        const deptId = deptMap.get(name)
        // 尝试读 survey-result.json（文件浏览器 API——存在即完成）
        const r = await fetch(`${BASE}/api/departments/${deptId}/workspace/file?path=survey-result.json`, { headers: auth })
        if (r.ok) {
          const d = await r.json().catch(() => null)
          if (d && !d.error) {
            done.add(name)
            console.log(`[${elapsed}s] ✅ ${name} 已完成（survey-result.json ${d.size} 字节）`)
          }
        }
      }
    } catch { /* 轮询失败重试 */ }
    if (done.size >= ROLES.length) {
      clearInterval(timer)
      console.log(`\n=== 🎉 问卷填写全部完成（${elapsed}s）——${[...done].join('、')} ===`)
      console.log('汇总：node --env-file=.env scripts/survey-summary.mjs')
      process.exit(0)
    }
    if (Date.now() - start > TIMEOUT_MS) {
      clearInterval(timer)
      console.error(`\n=== ❌ 超时（${Math.round(TIMEOUT_MS / 60000)} 分钟）——已完成 ${done.size}/10：${[...done].join('、') || '无'} ===`)
      process.exit(1)
    }
  }, 10_000)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
