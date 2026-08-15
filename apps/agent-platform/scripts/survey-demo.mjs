#!/usr/bin/env node
/**
 * 问卷演示一条龙（2026-12）——客户演示零操作成本
 *
 * 流程：seed（角色+部门+问卷调研）→ 部门发 @全员 → 监控执行面板 → 汇总报告
 * 用法：node --env-file=.env scripts/survey-demo.mjs
 * 前置：服务已启动（localhost:3000）+ docker + ap-sandbox 镜像
 */

import { execSync } from 'node:child_process'
import { join } from 'node:path'

// 与服务端一致的地址推导（PUBLIC_BASE_URL 未配置时用宿主 IP——消息给 AI 可达地址）
function detectBase() {
  if (process.env.PUBLIC_BASE_URL && !process.env.PUBLIC_BASE_URL.includes('localhost')) return process.env.PUBLIC_BASE_URL
  const os = require('node:os')
  const nets = os.networkInterfaces()
  const ip = Object.values(nets).flat().find((n) => n?.family === 'IPv4' && !n.internal)?.address
  return ip ? `http://${ip}:${process.env.PORT ?? 3000}` : 'http://localhost:3000'
}
const BASE = detectBase()
const EMAIL = process.env.SEED_EMAIL ?? 'admin@demo.com'
const PASSWORD = process.env.SEED_PASSWORD ?? 'admin123'
const SCRIPT_DIR = join(import.meta.dirname ?? process.cwd())
const TIMEOUT_MS = 8 * 60_000 // 8 分钟上限

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
  console.log('=== 问卷演示一条龙（10 角色填写）===\n')

  // 1) 健康检查
  const health = await fetch(`${BASE}/healthz`).then((r) => r.json()).catch(() => null)
  if (!health?.deps?.sandbox?.imageReady) {
    console.error('❌ 服务/沙盒未就绪（先启动服务）')
    process.exit(1)
  }
  console.log(`✅ 服务健康（沙盒 ${health.deps.sandbox.available ? '就绪' : '不可用'}）`)

  // 2) seed（幂等——角色部门/agent/问卷调研）
  console.log('\n[1/4] 准备角色（seed-survey-agents）...')
  execSync(`node --env-file=.env ${join(SCRIPT_DIR, 'seed-survey-agents.mjs')}`, { stdio: 'inherit', cwd: join(SCRIPT_DIR, '..') })

  // 3) 登录 + 问卷调研部门发 @全员
  console.log('\n[2/4] 派发任务（问卷调研部门 @全员）...')
  const login = await api('/api/auth/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } })
  const appLogin = await api('/api/auth/apps/demo/login', {
    method: 'POST', headers: { Authorization: `Bearer ${login.token}` }, body: { email: EMAIL, password: PASSWORD },
  })
  const auth = { Authorization: `Bearer ${appLogin.token}` }
  const depts = await api('/api/departments', { headers: auth })
  const hub = depts.departments.find((d) => d.name === '问卷调研' && !d.is_dm)
  if (!hub) { console.error('❌ 未找到「问卷调研」部门'); process.exit(1) }
  await api(`/api/departments/${hub.id}/messages`, {
    method: 'POST', headers: auth,
    body: { content: `@所有人 请大家现在填写问卷 ${BASE}/demo-survey（每个人按自己的人设作答提交，完成后把结果写到自己的工作目录 survey-result.json 并关闭浏览器）` },
  })
  console.log(`✅ 已派发 @全员（问卷：${BASE}/demo-survey）`)

  // 4) 监控执行面板直到 10/10 或超时
  console.log('\n[3/4] 监控执行状态（执行面板）...')
  const start = Date.now()
  let lastReport = ''
  while (Date.now() - start < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 15_000))
    try {
      const d = await api(`/api/departments/${hub.id}/executions`, { headers: auth })
      const { done, total } = d.progress ?? { done: 0, total: 0 }
      const working = (d.tasks ?? []).filter((t) => t.status === 'working')
      const failed = (d.tasks ?? []).filter((t) => t.status === 'failed')
      const line = `[${Math.round((Date.now() - start) / 1000)}s] 完成 ${done}/${total} · 执行中 ${working.length} · 失败 ${failed.length}`
      if (line !== lastReport) { console.log(line); lastReport = line }
      if (done >= total) {
        console.log(`\n=== 🎉 演示完成（${Math.round((Date.now() - start) / 1000)}s）——${total} 个角色全部填写提交 ===`)
        console.log(`查看结果：${BASE}/demo-survey/stats（统计页）· 各角色工作目录 survey-result.json`)
        execSync(`node --env-file=.env ${join(SCRIPT_DIR, 'survey-summary.mjs')}`, { stdio: 'inherit', cwd: join(SCRIPT_DIR, '..') })
        process.exit(0)
      }
    } catch { /* 轮询失败重试 */ }
  }
  console.error(`\n=== ❌ 超时（${Math.round(TIMEOUT_MS / 60000)} 分钟）——部分角色未完成，执行面板可定位 ===`)
  process.exit(1)
}

main().catch((e) => { console.error('失败:', e.message); process.exit(1) })
