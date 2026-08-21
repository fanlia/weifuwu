import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('response', r => { if (r.status() >= 400) console.log('[HTTP' + r.status() + ']', r.url().slice(-60)) })
const s = spawn('node', ['server.ts'], { cwd: resolve('examples/apps/todo'), stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
s.stdout.on('data', d => { out += String(d) })
s.stderr.on('data', d => { out += '[ERR] ' + String(d) })
for (let i = 0; i < 60 && !out.includes('listening'); i++) await new Promise(r => setTimeout(r, 100))
await page.goto('http://localhost:3300/', { waitUntil: 'domcontentloaded', timeout: 6000 })
await page.waitForTimeout(1500)
console.log('--- server stderr:', (out.match(/\[ERR\][^\n]*/g) ?? []).slice(0, 3).join(' | ') || '无')
browser.close(); s.kill(); setTimeout(() => process.exit(0), 200)
