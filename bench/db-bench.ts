/**
 * DB 客户端性能基准：自研 vs 原客户端（postgres.js / ioredis）
 *
 * 公平条件：相同池大小、相同操作、预热后多次迭代取中位数。
 * 用法: node --env-file=.env bench/db-bench.mjs
 */

import { performance } from 'node:perf_hooks'
import postgresFactory from 'postgres'
import { Redis as IORedis } from 'ioredis'
import { PgPool } from '../src/server/db/postgres/pool.ts'
import { RedisPool } from '../src/server/db/redis/pool.ts'

const DB_URL = process.env.DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const POOL_SIZE = 5
const ITERS = 500
const CONCURRENCY = 20

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

async function bench(name: string, iters: number, fn: () => Promise<void>): Promise<number> {
  // 预热
  for (let i = 0; i < 10; i++) await fn()
  const times: number[] = []
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now()
    await fn()
    times.push(performance.now() - t0)
  }
  const med = median(times)
  console.log(`  ${name}: ${med.toFixed(3)} ms/op (中位数, ${iters} 次)`)
  return med
}

async function benchConcurrent(name: string, iters: number, fn: () => Promise<void>): Promise<void> {
  for (let i = 0; i < 10; i++) await fn()
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) {
    await Promise.all(Array.from({ length: CONCURRENCY }, () => fn()))
  }
  const total = performance.now() - t0
  console.log(`  ${name}: ${(total / iters).toFixed(1)} ms/批 (${CONCURRENCY} 并发, ${iters} 批)`)
}

// ── Postgres 对比 ────────────────────────────────

const table = 'wf_bench_a'
const tablePg = 'wf_bench_b'

async function pgBenchmark() {
  console.log('\n═══ Postgres ═══')

  // 自研
  const mine = await PgPool.create({ ...pgOpts(DB_URL), poolSize: POOL_SIZE })
  await mine.query(`DROP TABLE IF EXISTS ${table}`)
  await mine.query(`CREATE TABLE ${table} (id int PRIMARY KEY, title text, meta jsonb)`)
  await mine.query(`INSERT INTO ${table} VALUES (1, 'warmup', '{"a":1}')`)

  // 原版 postgres.js
  const orig = postgresFactory(DB_URL, { max: POOL_SIZE })
  await orig`DROP TABLE IF EXISTS ${orig(tablePg)}`
  await orig`CREATE TABLE ${orig(tablePg)} (id int PRIMARY KEY, title text, meta jsonb)`
  await orig`INSERT INTO ${orig(tablePg)} VALUES (1, 'warmup', ${{ a: 1 }})`

  console.log('[自研]')
  await bench('简单查询 SELECT 1', ITERS, () => mine.query('SELECT 1'))
  await bench('参数化 SELECT (含 jsonb)', ITERS, () => mine.query(`SELECT title, meta FROM ${table} WHERE id = $1`, [1]))
  await bench('参数化 INSERT (jsonb 对象)', 100, () =>
    mine.query(`INSERT INTO ${table} (id, title, meta) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`, [Math.floor(Math.random() * 100000), 'x', { a: Math.random() }]),
  )
  await bench('事务 (BEGIN/COMMIT)', 100, () =>
    mine.transaction(async (tx) => {
      await tx.query(`SELECT 1 FROM ${table} WHERE id = 1`)
    }),
  )
  await benchConcurrent('并发查询', 20, () => mine.query(`SELECT title FROM ${table} WHERE id = 1`))

  console.log('[postgres.js]')
  await bench('简单查询 SELECT 1', ITERS, () => orig`SELECT 1`)
  await bench('参数化 SELECT (含 jsonb)', ITERS, () => orig`SELECT title, meta FROM ${orig(tablePg)} WHERE id = ${1}`)
  await bench('参数化 INSERT (jsonb 对象)', 100, () =>
    orig`INSERT INTO ${orig(tablePg)} (id, title, meta) VALUES (${Math.floor(Math.random() * 100000)}, ${'x'}, ${{ a: Math.random() }}) ON CONFLICT (id) DO NOTHING`,
  )
  await bench('事务 (BEGIN/COMMIT)', 100, () =>
    orig.begin(async (sql) => {
      await sql`SELECT 1 FROM ${orig(tablePg)} WHERE id = ${1}`
    }),
  )
  await benchConcurrent('并发查询', 20, () => orig`SELECT title FROM ${orig(tablePg)} WHERE id = ${1}`)

  await mine.query(`DROP TABLE ${table}`)
  await mine.close()
  await orig`DROP TABLE ${orig(tablePg)}`
  await orig.end()
}

// ── Redis 对比 ───────────────────────────────────

async function redisBenchmark() {
  console.log('\n═══ Redis ═══')

  const mine = new RedisPool({ host: 'localhost', port: Number(new URL(REDIS_URL).port || 6379), poolSize: POOL_SIZE })
  await mine.ensure()
  const orig = new IORedis(REDIS_URL, { maxRetriesPerRequest: 1 })

  const k = 'wf_bench:key'

  console.log('[自研]')
  await bench('set', ITERS, () => mine.set(k, 'v'))
  await bench('get', ITERS, () => mine.get(k))
  await bench('jsonSet/jsonGet 往返', ITERS, () => mine.jsonSet(k, { a: 1, b: [1, 2, 3] }).then(() => mine.jsonGet(k)))
  await benchConcurrent('并发 set', 20, () => mine.set(k, 'v'))

  console.log('[ioredis]')
  await bench('set', ITERS, () => orig.set(k, 'v'))
  await bench('get', ITERS, () => orig.get(k))
  await bench('jsonSet/jsonGet 往返', ITERS, async () => {
    await orig.set(k, JSON.stringify({ a: 1, b: [1, 2, 3] }))
    await orig.get(k).then((v) => JSON.parse(String(v)))
  })
  await benchConcurrent('并发 set', 20, () => orig.set(k, 'v'))

  await mine.close()
  await orig.quit()
}

await pgBenchmark()
await redisBenchmark()
console.log('\n基准完成')
process.exit(0)
