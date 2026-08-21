import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const s = spawn('node', ['src/test/scenario/server.ts'], { cwd: process.cwd(), env: { ...process.env, SCENARIO_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] })
let logs = ''
s.stdout.on('data', d => { logs += String(d); const m = String(d).match(/server on :(\d+)/); if (m) start(m[1]) })
async function start(port) {
  const b = await chromium.launch()
  const p = await b.newPage()
  p.on('console', m => { if (m.type() === 'error') console.log('[c]', m.text().slice(0, 120)) })
  await p.goto('http://localhost:' + port + '/scenario/cap-videoplayer', { waitUntil: 'networkidle' })
  await p.waitForTimeout(2000)
  console.log('log:', await p.evaluate(() => document.querySelector('.deep-videoplayer2-log')?.textContent ?? ''))
  console.log('readyState:', await p.evaluate(() => document.querySelector('video')?.readyState))
  b.close(); s.kill(); setTimeout(() => process.exit(0), 300)
}
