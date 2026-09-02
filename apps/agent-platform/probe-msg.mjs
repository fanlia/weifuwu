import { spawn } from 'node:child_process'
const PORT = 39222
const srv = spawn('node', ['--env-file=.env', 'server.ts'], { env: { ...process.env, PORT: String(PORT) }, detached: true, stdio: 'ignore' })
const BASE = `http://localhost:${PORT}`
let up = false
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 3000))
  try { const res = await fetch(`${BASE}/api/ops`, { signal: AbortSignal.timeout(1500) }); if (res.status < 500) { up = true; break } } catch {}
}
if (!up) { process.kill(-srv.pid); process.exit(1) }
const api = async (path, init = {}, token) => {
  const res = await fetch(BASE + path, { ...init, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${path}: ${data.error ?? res.status}`)
  return data
}
const suf = String(Date.now()).slice(-8)
const reg = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ email: `m-${suf}@e2e.test`, name: '探', password: 'x1234567', companyName: `c${suf}`, appName: `a${suf}` }) })
const token = reg.token
const dept = await api('/api/departments', { method: 'POST', body: JSON.stringify({ name: '图组' }) }, token)
const agent = await api('/api/agents', { method: 'POST', body: JSON.stringify({ type: 'ai', name: '画师', model: 'm', description: 'd' }) }, token)
const { postgres } = await import('weifuwu')
const pg = postgres(process.env.DATABASE_URL, { max: 2, closeTimeout: 1 })
await pg.sql`INSERT INTO messages (department_id, sender_id, content, msg_type) VALUES (${dept.department.id}, ${agent.agent.id}, '海报已生成：/ws/t.png（已存入）', 'text')`
await pg.close()
const msgs = await api(`/api/departments/${dept.department.id}/messages`, {}, token)
const m = msgs.messages[0]
console.log('content:', m.content)
console.log('status:', JSON.stringify(m.status), 'sender_type:', m.sender_type)
const res = await fetch(`${BASE}/api/departments/${dept.department.id}/workspace/file?path=${encodeURIComponent('/t.png')}`, { headers: { Authorization: `Bearer ${token}` } })
console.log('file fetch:', res.status, (await res.arrayBuffer()).byteLength)
process.kill(-srv.pid)
