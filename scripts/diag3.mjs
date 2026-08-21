import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
const browser = await chromium.launch()
const page = await browser.newPage()
page.on('console', m => { if (m.type() === 'error') console.log('[cw]', m.text().slice(0, 100)) })
page.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 120)))
const s = spawn('node', ['server.ts'], { cwd: resolve('examples/apps/todo'), stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
s.stdout.on('data', d => { out += String(d) })
s.stderr.on('data', d => { out += '[ERR] ' + String(d) })
for (let i = 0; i < 60 && !out.includes('listening'); i++) await new Promise(r => setTimeout(r, 100))
console.log('listening:', out.includes('listening'))
const res = await page.goto('http://localhost:3300/', { waitUntil: 'domcontentloaded', timeout: 6000 })
console.log('goto status:', res?.status())
await page.waitForTimeout(800)
console.log('body:', JSON.stringify((await page.evaluate(() => document.body.textContent ?? '')).slice(0, 50)))
console.log('html head:', (await page.evaluate(() => document.documentElement.outerHTML.slice(0, 150))).replace(/\n/g, ' '))
browser.close(); s.kill(); setTimeout(() => process.exit(0), 200)
