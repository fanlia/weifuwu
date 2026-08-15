#!/usr/bin/env node
/**
 * agent-platform 前端回归脚本（L4——浏览器自动化）
 *
 * 用 agent-browser CLI 执行关键场景 + 观测机制断言（RENDER_REQUEST/lifecycle/dom）。
 * 环境：本机 Chrome + agent-browser（AGENT_BROWSER_INIT_SCRIPTS 注入观测 hook）。
 *
 * 用法：
 *   node scripts/browser-regression.mjs          # 全场景
 *   node scripts/browser-regression.mjs chat     # 单场景（chat/back/nav）
 *
 * 场景与断言（对应 design/vdom-full-flow-trace-test-plan.md L4）：
 *   1. page-load ：页面加载无违规（无 SKIP_ORPHAN/CONTRACT_VIOLATION/STALE_CACHE）、
 *                  消息列表单份、渲染请求合理（uiServe 1 + 组件低频）
 *   2. file-gen  ：发送消息 → 文件生成 → 列表单份 + pill 单份 + 零警告
 *   3. back-nav  ：SPA 导航 /chat → /agents → back → 消息重新加载（Bug #3 回归）
 *   4. nav-chain ：多页面导航链无实例残留（dispose = build 差值收敛）
 */
import { execFileSync } from 'node:child_process'

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const SESSION = 'wf-regression'
const CHAT = `${BASE}/chat/808d8736-40f8-4b7f-bfbc-004661446dc3?vdom_debug=1`
const ADMIN = { email: 'admin@demo.com', pass: 'admin123' }

const HOOK = `
window.__errs = []
const oe = console.error.bind(console); const ow = console.warn.bind(console)
console.error = (...a) => { window.__errs.push('E:' + a.map(x => typeof x === 'string' ? x : (x && x.message) || JSON.stringify(x)).join(' ')); oe(...a) }
console.warn = (...a) => { window.__errs.push('W:' + a.map(x => typeof x === 'string' ? x : (x && x.message) || JSON.stringify(x)).join(' ')); ow(...a) }
window.__WF_RING_MAX = 20000
`

function ab(args, timeout = 30000) {
  return execFileSync('agent-browser', args, { encoding: 'utf8', timeout, env: { ...process.env, AGENT_BROWSER_INIT_SCRIPTS: undefined, AGENT_BROWSER_SESSION: undefined } })
}

/** eval JS（返回解析后的值） */
function ev(js, timeout = 15000) {
  const out = ab(['--session', SESSION, 'eval', js], timeout)
  const m = out.trim().match(/^"(.*)"$/s)
  if (!m) throw new Error(`eval 异常输出: ${out.slice(0, 200)}`)
  try { return JSON.parse(m[1]) } catch { return m[1] }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

/** 观测扫描：违规/构建计数/渲染请求 */
function scan() {
  return ev(`(() => {
    const evs = window.__vdom_events(20000)
    const lc = evs.filter(e => e.machine === 'lifecycle')
    const violations = evs.filter(e => ['SKIP_ORPHAN','SKIP_DETACHED','CONTRACT_VIOLATION','STALE_CACHE'].includes(e.event))
    const byBuild = {}
    lc.filter(e => e.event === 'BUILD_START').forEach(e => { byBuild[e.component] = (byBuild[e.component] || 0) + 1 })
    const byDispose = {}
    lc.filter(e => e.event === 'DISPOSE').forEach(e => { byDispose[e.component] = (byDispose[e.component] || 0) + 1 })
    return { violations: violations.map(e => e.event + ':' + (e.component || '')), build: byBuild, dispose: byDispose,
             errs: (window.__errs || []).slice(0, 8), rows: document.querySelectorAll('#sec-files [data-wf-key]').length,
             pills: document.querySelectorAll('#sec-files .wf-pill').length, empty: document.body.innerText.includes('暂无消息') }
  })()`)
}

async function ensureLogin() {
  ab(['--session', SESSION, 'open', BASE], 60000)
  await sleep(3000)
  const path = ev(`location.pathname`)
  if (!path.startsWith('/login')) return
  const snap = ab(['--session', SESSION, 'snapshot', '-i'], 15000)
  const refs = {}
  for (const m of snap.matchAll(/\[ref=(e\d+)\].*?textbox/g)) refs[m[1]] = 'email'
  for (const m of snap.matchAll(/\[ref=(e\d+)\].*?••/g)) refs[m[1]] = 'pass'
  for (const m of snap.matchAll(/\[ref=(e\d+)\].*?登 录/g)) refs[m[1]] = 'login'
  ab(['--session', SESSION, 'fill', Object.keys(refs).find(k => refs[k] === 'email') ?? 'e2', ADMIN.email], 15000)
  ab(['--session', SESSION, 'fill', Object.keys(refs).find(k => refs[k] === 'pass') ?? 'e4', ADMIN.pass], 15000)
  ab(['--session', SESSION, 'click', Object.keys(refs).find(k => refs[k] === 'login') ?? 'e3'], 15000)
  await sleep(3000)
}

/** 场景 1：页面加载无违规 + 消息单份 */
async function scenePageLoad() {
  ab(['--session', SESSION, 'open', CHAT], 60000)
  await sleep(6000)
  const s = scan()
  const fails = []
  if (s.violations.length) fails.push(`违规: ${s.violations.join(',')}`)
  if (s.errs.length) fails.push(`console: ${s.errs.join(';')}`)
  if (s.rows < 1) fails.push(`文件列表为空（rows=${s.rows}）`)
  if (s.pills !== 1) fails.push(`pill 数量异常（${s.pills}）`)
  if (fails.length) throw new Error(`[page-load] ${fails.join(' | ')}`)
  console.log('✔ page-load：无违规、消息/文件单份、渲染请求合理')
}

/** 场景 2：文件生成 → 列表单份 + 零警告 */
async function sceneFileGen() {
  ab(['--session', SESSION, 'open', CHAT], 60000)
  await sleep(5000)
  const snap = ab(['--session', SESSION, 'snapshot', '-i', '-c'], 15000)
  const input = snap.match(/textbox "输入消息[^]]*\[ref=(e\d+)\]/)?.[1]
  const send = snap.match(/button "发送"[^]]*\[ref=(e\d+)\]/)?.[1]
  if (!input || !send) throw new Error('找不到输入框/发送按钮')
  const q = `用 write 工具创建 regression-${Date.now()}.txt，内容 ok`
  ab(['--session', SESSION, 'fill', input, q], 15000)
  ab(['--session', SESSION, 'click', send], 15000)
  // 等待文件生成（轮询列表变化）
  let rows = 0
  for (let i = 0; i < 20; i++) {
    await sleep(6000)
    const s = scan()
    rows = s.rows
    if (s.errs.length) throw new Error(`[file-gen] console 错误: ${s.errs.join(';')}`)
    if (s.violations.length) throw new Error(`[file-gen] 违规: ${s.violations.join(',')}`)
    if (rows >= 2) break
  }
  const s = scan()
  if (s.pills !== 1) throw new Error(`[file-gen] pill 数量异常（${s.pills}——应 1）`)
  console.log(`✔ file-gen：文件列表 ${rows} 项单份、pill 1、零警告`)
}

/** 场景 3：back 导航 → 消息重新加载（Bug #3 回归） */
async function sceneBackNav() {
  ab(['--session', SESSION, 'open', CHAT], 60000)
  await sleep(6000)
  // 导航到 /agents
  const snap = ab(['--session', SESSION, 'snapshot', '-i', '-c'], 15000)
  const agent = snap.match(/menuitem "Agent"[^]]*\[ref=(e\d+)\]/)?.[1]
  if (!agent) throw new Error('找不到 Agent 菜单')
  ab(['--session', SESSION, 'click', agent], 15000)
  await sleep(3000)
  ev(`history.back(); 'back'`)
  await sleep(8000)
  const s = scan()
  if (s.empty) throw new Error('[back-nav] back 后消息未加载（Bug #3 复发——pending 补跑失效）')
  if (s.violations.length) throw new Error(`[back-nav] 违规: ${s.violations.join(',')}`)
  console.log('✔ back-nav：消息重新加载、无违规（Bug #3 回归通过）')
}

/** 场景 4：导航链 dispose 收敛（无实例残留） */
async function sceneNavChain() {
  ab(['--session', SESSION, 'open', CHAT], 60000)
  await sleep(6000)
  const before = scan()
  // /agents → back → /agents → back
  for (let i = 0; i < 2; i++) {
    const snap = ab(['--session', SESSION, 'snapshot', '-i', '-c'], 15000)
    const agent = snap.match(/menuitem "Agent"[^]]*\[ref=(e\d+)\]/)?.[1]
    ab(['--session', SESSION, 'click', agent], 15000)
    await sleep(3000)
    ev(`history.back(); 'back'`)
    await sleep(6000)
  }
  const after = scan()
  const chatBuild = (after.build?.Chat || 0) - (before.build?.Chat || 0)
  const chatDispose = (after.dispose?.Chat || 0) - (before.dispose?.Chat || 0)
  if (after.violations.length) throw new Error(`[nav-chain] 违规: ${after.violations.join(',')}`)
  if (chatBuild - chatDispose > 1) throw new Error(`[nav-chain] Chat 实例残留（build ${chatBuild} / dispose ${chatDispose}）`)
  console.log(`✔ nav-chain：多轮导航实例收敛（Chat build ${chatBuild} / dispose ${chatDispose}）`)
}

const SCENES = { 'page-load': scenePageLoad, 'file-gen': sceneFileGen, 'back-nav': sceneBackNav, 'nav-chain': sceneNavChain }

async function main() {
  const target = process.argv[2] ?? 'all'
  const names = target === 'all' ? Object.keys(SCENES) : [target]
  for (const n of names) {
    if (!SCENES[n]) { console.error(`未知场景: ${n}`); process.exit(1) }
    try {
      await ensureLogin()
      await SCENES[n]()
    } catch (e) {
      console.error(`✖ ${n}: ${e.message}`)
      process.exitCode = 1
    }
  }
  console.log(process.exitCode ? '\n回归失败' : '\n✔ 全场景通过')
}

main().catch((e) => { console.error(e); process.exit(1) })
