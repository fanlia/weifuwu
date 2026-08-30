/**
 * /api/stats 接口性能对比：自研 PgPool vs postgres.js
 * 模拟接口的完整 SQL 序列（5 个参数化查询 + JSON 组装）
 * 用法: node --env-file=.env bench/stats-bench.ts
 */

import { performance } from 'node:perf_hooks'
import postgresFactory from 'postgres'
import { PgPool } from '../src/server/db/postgres/pool.ts'

const DB_URL = process.env.DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo'
const ITERS = 100
const TENANT_ID = '567d5b32-94ef-4839-b8e7-79a1be1f05c9' // agent-platform e2e tenant

function pgOpts(url: string) {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  }
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function bench(name: string, iters: number, fn: () => Promise<unknown>): Promise<number> {
  for (let i = 0; i < 5; i++) await fn()
  const t: number[] = []
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now()
    await fn()
    t.push(performance.now() - t0)
  }
  const med = median(t)
  const p95 = t.sort((a, b) => a - b)[Math.floor(t.length * 0.95)]
  console.log(`  ${name}: ${med.toFixed(3)} ms/op (中位) | p95: ${p95.toFixed(3)} ms`)
  return med
}

// ── 自研 ──────────────────────────────────────

const mine = await PgPool.create({ ...pgOpts(DB_URL), poolSize: 10 })

async function statsMine(): Promise<unknown> {
  const [agentStats] = await mine.query(
    `SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE type = 'ai')::int as ai_count,
     COUNT(*) FILTER (WHERE type = 'webhook')::int as webhook_count,
     COUNT(*) FILTER (WHERE type = 'knowledge_base')::int as kb_count,
     COUNT(*) FILTER (WHERE type = 'user')::int as user_count
     FROM agents WHERE tenant_id = $1`,
    [TENANT_ID],
  )
  const [deptStats] = await mine.query(
    `SELECT COUNT(*)::int as total FROM departments d JOIN companies c ON c.id = d.company_id WHERE c.tenant_id = $1`,
    [TENANT_ID],
  )
  const [msgStats] = await mine.query(
    `SELECT COUNT(*)::int as total FROM messages m JOIN agents a ON a.id = m.sender_id WHERE a.tenant_id = $1`,
    [TENANT_ID],
  )
  const [tokenStats] = await mine.query(
    `SELECT COALESCE(SUM(tokens_prompt), 0)::int as total_prompt,
     COALESCE(SUM(tokens_completion), 0)::int as total_completion,
     COALESCE(SUM(tokens_total), 0)::int as total_tokens
     FROM agent_logs WHERE tenant_id = $1`,
    [TENANT_ID],
  )
  const trend = await mine.query(
    `SELECT DATE(m.created_at) as day, COUNT(*)::int as count FROM messages m
     JOIN agents a ON a.id = m.sender_id
     WHERE a.tenant_id = $1 AND m.created_at >= NOW() - INTERVAL '7 days'
     GROUP BY DATE(m.created_at) ORDER BY day`,
    [TENANT_ID],
  )
  return { agents: agentStats, departments: deptStats, messages: msgStats, tokens: tokenStats, trend }
}

// ── postgres.js ───────────────────────────────

const orig = postgresFactory(DB_URL, { max: 10 })

async function statsOrig(): Promise<unknown> {
  const [agentStats] = await orig`
    SELECT COUNT(*)::int as total, COUNT(*) FILTER (WHERE type = 'ai')::int as ai_count,
    COUNT(*) FILTER (WHERE type = 'webhook')::int as webhook_count,
    COUNT(*) FILTER (WHERE type = 'knowledge_base')::int as kb_count,
    COUNT(*) FILTER (WHERE type = 'user')::int as user_count
    FROM agents WHERE tenant_id = ${TENANT_ID}`
  const [deptStats] = await orig`
    SELECT COUNT(*)::int as total FROM departments d JOIN companies c ON c.id = d.company_id WHERE c.tenant_id = ${TENANT_ID}`
  const [msgStats] = await orig`
    SELECT COUNT(*)::int as total FROM messages m JOIN agents a ON a.id = m.sender_id WHERE a.tenant_id = ${TENANT_ID}`
  const [tokenStats] = await orig`
    SELECT COALESCE(SUM(tokens_prompt), 0)::int as total_prompt,
    COALESCE(SUM(tokens_completion), 0)::int as total_completion,
    COALESCE(SUM(tokens_total), 0)::int as total_tokens
    FROM agent_logs WHERE tenant_id = ${TENANT_ID}`
  const trend = await orig`
    SELECT DATE(m.created_at) as day, COUNT(*)::int as count FROM messages m
    JOIN agents a ON a.id = m.sender_id
    WHERE a.tenant_id = ${TENANT_ID} AND m.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY DATE(m.created_at) ORDER BY day`
  return { agents: agentStats, departments: deptStats, messages: msgStats, tokens: tokenStats, trend }
}

console.log('═══ /api/stats（5 查询序列，tenant 过滤）═══\n')
console.log('[自研]')
await bench('stats 全序列', ITERS, statsMine)
console.log('[postgres.js]')
await bench('stats 全序列', ITERS, statsOrig)

await mine.close()
await orig.end()
console.log('\n完成')
process.exit(0)
