// Redis 差距分层分析：编码 / 解析 / 框架层
import { performance } from 'node:perf_hooks'
import { encodeCommand, RespParser } from '../src/server/db/redis/resp.ts'
import { RedisConnection } from '../src/server/db/redis/connection.ts'
import { RedisPool } from '../src/server/db/redis/pool.ts'
import { Redis as IORedis, Command } from 'ioredis'
import RedisParser from 'redis-parser'

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function bench(name: string, iters: number, fn: () => Promise<unknown> | void): Promise<number> {
  for (let i = 0; i < 50; i++) await fn()
  const t: number[] = []
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now()
    await fn()
    t.push(performance.now() - t0)
  }
  const med = median(t)
  console.log(`  ${name}: ${med.toFixed(4)} ms/op`)
  return med
}

console.log('═══ Redis 分层差距 ═══\n')

// 1. 纯编码
const cmd = ['GET', 'wf_bench:key']
await bench('自研 encodeCommand (纯 CPU)', 20000, () => encodeCommand(cmd))
await bench('ioredis Command 构建 (纯 CPU)', 20000, () => new Command('get', ['wf_bench:key']))

// 2. 纯解析（相同输入）
const reply = Buffer.from('$11\r\nwf_bench:key\r\n')
await bench('自研 RespParser (纯 CPU)', 20000, () => new RespParser().push(new Uint8Array(reply)))
await bench('ioredis redis-parser (纯 CPU)', 20000, () => {
  const p = new RedisParser({ returnReply: () => {}, returnError: () => {}, returnFatalError: () => {} })
  p.execute(reply)
})

// 3. 连接层命令往返（无 pool 框架）
const conn = new RedisConnection({ port: 6379 })
await conn.connect()
const ioredis = new IORedis('redis://localhost:6379', { maxRetriesPerRequest: 1 })
await bench('自研 connection.command GET', 2000, () => conn.command('GET', 'wf_bench:key'))
await bench('ioredis get (连接层)', 2000, () => ioredis.get('wf_bench:key'))

// 4. pool 层（完整框架）
const pool = new RedisPool({ port: 6379, poolSize: 5 })
await pool.ensure()
await bench('自研 pool.get', 2000, () => pool.get('wf_bench:key'))

await conn.close()
await ioredis.quit()
await pool.close()
process.exit(0)
