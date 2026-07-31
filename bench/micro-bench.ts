// 微基准：定位自研 vs 原客户端的差距来源
import { performance } from 'node:perf_hooks'
import { encodeCommand, RespParser } from '../src/db/redis/resp.ts'
import RedisParser from 'redis-parser'

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function bench(name: string, iters: number, fn: () => void): Promise<number> {
  for (let i = 0; i < 1000; i++) fn()
  const t: number[] = []
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now()
    fn()
    t.push(performance.now() - t0)
  }
  const med = median(t)
  console.log(`  ${name}: ${med.toFixed(4)} ms/op`)
  return med
}

console.log('═══ RESP 编解码微基准（纯 CPU，无网络）═══')

// 1. 命令编码
const setCmd = ['SET', 'wf_bench:key', 'value']
await bench('自研 encodeCommand', 10000, () => encodeCommand(setCmd))
const ioredisCmd = ['SET', 'wf_bench:key', 'value']
// ioredis 的序列化（近似：buffer 拼接）
await bench('ioredis 风格 (Buffer.concat)', 10000, () => {
  const parts = [`*${setCmd.length}\r\n`]
  for (const a of setCmd) parts.push(`$${Buffer.byteLength(a)}\r\n${a}\r\n`)
  Buffer.from(parts.join(''))
})

// 2. 响应解析
const reply = Buffer.from('*3\r\n$7\r\nmessage\r\n$12\r\nwf_bench:key\r\n$5\r\nhello\r\n')
await bench('自研 RespParser', 10000, () => new RespParser().push(new Uint8Array(reply)))
await bench('redis-parser', 10000, () => {
  const parser = new RedisParser({
    returnReply: () => {},
    returnError: () => {},
    returnFatalError: () => {},
  })
  parser.execute(reply)
})

// 3. 增量解析（分片累积——连接层真实模式）
const chunk = new Uint8Array(reply)
await bench('自研 pushAll 分片', 5000, () => {
  const p = new RespParser()
  p.pushAll(chunk.subarray(0, 10))
  p.pushAll(chunk.subarray(10))
})

process.exit(0)
