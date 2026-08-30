// 大响应场景：1MB 数组（KEYS 大列表模拟）
import { performance } from 'node:perf_hooks'
import { RespParser } from '../src/server/db/redis/resp.ts'
import RedisParser from 'redis-parser'

// 构造 10000 个 bulk 的数组（~180KB）
const parts = ['*10000\r\n']
for (let i = 0; i < 10000; i++) parts.push(`$4\r\nkey${i % 10}\r\n`)
const reply = Buffer.from(parts.join(''))
console.log('响应大小:', reply.length, '字节, 10000 元素')

const t0 = performance.now()
for (let i = 0; i < 50; i++) new RespParser().push(new Uint8Array(reply))
console.log('自研 RespParser: ', ((performance.now() - t0) / 50).toFixed(3), 'ms/op')

const t1 = performance.now()
for (let i = 0; i < 50; i++) {
  const p = new RedisParser({ returnReply: () => {}, returnError: () => {}, returnFatalError: () => {} })
  p.execute(reply)
}
console.log('redis-parser:     ', ((performance.now() - t1) / 50).toFixed(3), 'ms/op')
process.exit(0)
