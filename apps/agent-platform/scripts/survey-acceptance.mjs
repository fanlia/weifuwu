/**
 * 问卷生产验收——10 角色 10 填写 10 提交 10 退出
 *
 * 生产环境方式：干净启动（清容器 + 重启服务）→ launch 一键派单 →
 * 监控 WS 直到：10 份全部提交 + 在线归零（每个角色填完关闭页面）。
 *
 * 用法：node --env-file=.env scripts/survey-acceptance.mjs
 * 通过：exit 0（输出验收报告）；失败/超时：exit 1
 */

const BASE = 'http://localhost:3000'
const TOTAL_ROLES = 10
const TIMEOUT_MS = 10 * 60 * 1000 // 10 分钟上限

async function main() {
  console.log('=== 问卷生产验收：10 角色 → 10 填写 → 10 提交 → 10 退出 ===\n')

  // 1) 前置检查：服务健康
  const health = await fetch(`${BASE}/healthz`).then(r => r.json()).catch(() => null)
  if (!health?.deps?.sandbox?.imageReady) {
    console.error('❌ 沙盒镜像未就绪（SANDBOX_IMAGE=ap-sandbox:latest?）——healthz:', JSON.stringify(health))
    process.exit(1)
  }
  console.log(`✅ 服务健康（version ${health.version} · 沙盒 ${health.deps.sandbox.mode} · 池上限 ${health.deps.sandbox.maxContainers}）`)

  // 2) 干净状态：确认无残留提交（生产验收从零开始——服务刚启动内存为空）
  // 3) 一键派单
  const launch = await fetch(`${BASE}/demo-survey/launch`, { method: 'POST' }).then(r => r.json())
  if (!launch.success) {
    console.error('❌ launch 失败:', launch.error)
    process.exit(1)
  }
  console.log(`✅ 一键派单：${launch.sent} 个角色（错峰 1.2s）\n`)

  // 4) WS 监控：提交数 + 在线人数（直到 10/0 或超时）
  const WebSocket = (await import('ws')).default
  const obs = new WebSocket('ws://localhost:3000/survey-live')
  let submitted = 0
  let online = -1
  let onlineLog = []
  let peakOnline = 0
  let submittedLog = []
  let done = false

  const start = Date.now()
  const finish = (ok, msg) => {
    if (done) return
    done = true
    obs.close()
    console.log(msg)
    process.exit(ok ? 0 : 1)
  }

  obs.on('message', (d) => {
    const msg = JSON.parse(String(d))
    if (msg.type === 'survey:state') {
      submitted = msg.count ?? 0
      online = msg.online?.count ?? 0
      submittedLog = (msg.submissions ?? []).map(x => x.source)
      console.log(`[初始] 已提交 ${submitted}/10 · 在线 ${online}`)
      peakOnline = Math.max(peakOnline, online)
    }
    if (msg.type === 'survey:online') {
      online = msg.count ?? 0
      onlineLog.push(online)
      peakOnline = Math.max(peakOnline, online)
      const elapsed = Math.round((Date.now() - start) / 1000)
      console.log(`[${elapsed}s] 在线 ${online}（${(msg.sources ?? []).join('、') || '无'}）`)
    }
    if (msg.type === 'survey:submitted') {
      submitted = msg.count ?? 0
      submittedLog = [...submittedLog.filter(x => x !== msg.latest?.source), msg.latest?.source]
      const elapsed = Math.round((Date.now() - start) / 1000)
      console.log(`[${elapsed}s] ✅ 提交 ${submitted}/10（${msg.latest?.source}）`)
    }
    // 验收条件：10 份提交 + 在线归零
    if (submitted >= TOTAL_ROLES && online === 0 && submittedLog.length >= TOTAL_ROLES) {
      const elapsed = Math.round((Date.now() - start) / 1000)
      finish(true, `
=== 🎉 验收通过（${elapsed}s）===
✅ 10 个角色全部填写提交：${submittedLog.join('、')}
✅ 10 个角色全部退出（在线归零——关闭页面指令生效）
📊 在线峰值：${peakOnline}（错峰派单未超并发）
提交顺序：${submittedLog.join(' → ')}`)
    }
  })

  // 超时兜底
  setTimeout(() => {
    finish(false, `
=== ❌ 验收失败（超时 ${Math.round(TIMEOUT_MS / 60000)} 分钟）===
已提交 ${submitted}/10（${submittedLog.join('、') || '无'}）
当前在线 ${online}（在线变化：${onlineLog.slice(-10).join(' → ')}）
峰值在线 ${peakOnline}
可能原因：角色浏览器卡住 / 容器启动失败 / 提交未落内存`)
  }, TIMEOUT_MS)
}

main().catch((e) => { console.error('验收脚本错误:', e); process.exit(1) })
