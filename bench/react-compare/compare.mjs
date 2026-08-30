/**
 * React 19 vs weifuwu vdom —— 同构基准对比（6000 行 × 4 节点）
 * 公平性：双方加载**同一份** components.css（样式负担对齐）
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WF_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const WF_SCENARIO = resolve(WF_ROOT, 'src', 'test', 'scenario', 'server.ts')

/** 先起 weifuwu 场景 server（供拉 CSS） */
const wfServer = spawn('node', [WF_SCENARIO], {
  cwd: WF_ROOT, env: { ...process.env, SCENARIO_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
})
const wfBase = await new Promise((resolveP, reject) => {
  const timer = setTimeout(() => reject(new Error('wf server timeout')), 8000)
  let logs = ''
  wfServer.stdout.on('data', (d) => {
    logs += String(d)
    const m = String(d).match(/server on :(\d+)/)
    if (m) { clearTimeout(timer); resolveP(`http://localhost:${m[1]}`) }
  })
  wfServer.stderr.on('data', (d) => { logs += String(d) })
  wfServer.on('exit', () => reject(new Error('wf server exit\n' + logs)))
})
console.log(`wf server  :${wfBase}`)

/** 对齐样式负担（公平对比——CSS 是 (program) 大头） */
let wfCss = ''
try {
  const res = await fetch(`${wfBase}/components.css`)
  wfCss = await res.text()
  console.log(`components.css: ${(wfCss.length / 1024).toFixed(0)}KB（双端同源）`)
} catch (e) { console.error('css 拉取失败', String(e)) }

/** React 静态 serve（/components.css 转代理） */
// eslint-disable-next-line no-unused-vars
const reactServer = createServer(async (req, res) => {
  if (req.url === '/components.css') {
    res.writeHead(200, { 'content-type': 'text/css' })
    res.end(wfCss)
    return
  }
  const p = req.url === '/' ? '/index.html' : req.url
  try {
    const body = await readFile(resolve(__dirname, p.slice(1)))
    res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/html' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end()
  }
})
await new Promise((r) => reactServer.listen(0, r))
const reactPort = reactServer.address().port
console.log(`react server :${reactPort}`)

const browser = await chromium.launch()

async function runPage(url) {
  const page = await browser.newPage()
  const out = {}
  let t = Date.now()
  await page.goto(url, { waitUntil: 'commit' })
  await page.waitForSelector('.perf-list .perf-row', { timeout: 30000 })
  out.mount = Date.now() - t
  out.rows = await page.locator('.perf-row').count()
  t = Date.now()
  await page.click('#perf-nav-away')
  await page.waitForSelector('.perf-gone')
  out.unmount = Date.now() - t
  await page.click('#perf-nav-back')
  await page.waitForSelector('.perf-list .perf-row')
  t = Date.now()
  await page.click('#perf-update')
  await page.waitForFunction(() => document.querySelector('.perf-name')?.textContent?.includes('-1'))
  out.update = Date.now() - t
  await page.click('#perf-nav-away')
  await page.waitForSelector('.perf-gone')
  t = Date.now()
  await page.click('#perf-nav-back')
  await page.waitForSelector('.perf-list .perf-row')
  out.remount = Date.now() - t
  await page.close()
  return out
}

const wf = await runPage(`${wfBase}/scenario/perf-applier`)
const react = await runPage(`http://localhost:${reactPort}/`)

console.log('\n═════ React 19 vs weifuwu vdom（6000 行 × 4 节点 · 同 CSS）═════')
console.log('  指标        React19      weifuwu      React/wf')
for (const k of ['mount', 'unmount', 'update', 'remount']) {
  const r = react[k]; const w = wf[k]
  console.log(`  ${k.padEnd(8)} ${String(r).padStart(6)}ms   ${String(w).padStart(6)}ms   ${(r / w).toFixed(2)}x`)
}
console.log(`  rows      ${react.rows}        ${wf.rows}`)

await browser.close()
reactServer.close(); wfServer.kill()
process.exit(0)
