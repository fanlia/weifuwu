import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
// 无 browser：spawn + fetch（完全复刻 audit 的 spawn 方式）
const s = spawn('node', ['server.ts'], { cwd: resolve('examples/apps/todo'), stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
s.stdout.on('data', d => { out += String(d) })
s.stderr.on('data', d => { out += '[ERR] ' + String(d) })
for (let i = 0; i < 60 && !out.includes('listening'); i++) await new Promise(r => setTimeout(r, 100))
console.log('listening seen:', out.includes('listening'), '| out:', out.slice(0, 80))
const res = await fetch('http://localhost:3300/')
console.log('fetch status:', res.status, '| body head:', (await res.text()).slice(0, 40).replace(/\n/g, ' '))
s.kill(); setTimeout(() => process.exit(0), 200)
