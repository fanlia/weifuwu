/**
 * native vs ws 差分对账（W5 门槛——0 不等价）
 *
 * 同一应用（echo）分别挂 native 适配器与 ws 适配器；原始帧客户端向两者
 * 发送**相同字节序列**（含任意传输分片），比较客户端可观察行为：
 * 帧序列（opcode+payload）+ 关闭码/理由——必须逐字节一致。
 *
 * 生成域：合法 RFC6455 序列（单帧/分片+插入 ping/关闭握手；长度档全覆盖）；
 * 非法帧行为由 native 向量测试与 Autobahn 覆盖（差分保底不与实现细节耦合）。
 */
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../../core/l1/server/router.ts'
import { serve, type Server } from '../../core/l1/server/serve.ts'
import { createNativeWsAdapter } from './native/index.ts'
import { createWsAdapter } from './adapter.ts'
import { rawWsConnect, OP, encodeFrame, type RawWs } from '../../test/helpers/raw-ws-client.ts'

const servers: Server[] = []
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop().catch(() => {})
})

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LENS = [0, 1, 17, 125, 126, 127, 1024, 65535, 65536]

interface Step {
  opcode: number
  payload: Buffer
  fin: boolean
}

function textPayload(rnd: () => number, len: number): Buffer {
  const chars = ['a', 'Z', '0', 'é', '世', '界', '🙂']
  let s = ''
  while (Buffer.byteLength(s) < len) s += chars[Math.floor(rnd() * chars.length)]
  return Buffer.from(s, 'utf8').subarray(0, len).length === len
    ? Buffer.from(s, 'utf8').subarray(0, len)
    : Buffer.concat([Buffer.from(s, 'utf8'), Buffer.alloc(len, 0x61)]).subarray(0, len)
}

function binaryPayload(rnd: () => number, len: number): Buffer {
  const b = Buffer.allocUnsafe(len)
  for (let i = 0; i < len; i++) b[i] = (rnd() * 256) | 0
  return b
}

/** 生成一个用例：帧步骤 + 传输分片（模拟任意 TCP 边界） */
function genCase(rnd: () => number): { steps: Step[]; expected: string[] } {
  const steps: Step[] = []
  const expected: string[] = []
  const kind = rnd()

  if (kind < 0.45) {
    const text = rnd() < 0.5
    const len = LENS[Math.floor(rnd() * LENS.length)]
    const payload = text ? textPayload(rnd, len) : binaryPayload(rnd, len)
    // 文本载荷必须合法 UTF-8：textPayload 截断可能产生残缺序列——按字节重建
    const body = text ? Buffer.from(payload.toString('utf8').replace(/\uFFFD/g, 'a'), 'utf8') : payload
    steps.push({ opcode: text ? OP.TEXT : OP.BINARY, payload: body, fin: true })
    expected.push(`${text ? OP.TEXT : OP.BINARY}:${body.toString('hex')}`)
  } else if (kind < 0.85) {
    const text = rnd() < 0.5
    const frags = 2 + Math.floor(rnd() * 4)
    const parts: Buffer[] = []
    for (let i = 0; i < frags; i++) {
      const part = text ? textPayload(rnd, Math.floor(rnd() * 40)) : binaryPayload(rnd, Math.floor(rnd() * 64))
      parts.push(text ? Buffer.from(part.toString('utf8').replace(/\uFFFD/g, 'b'), 'utf8') : part)
    }
    const full = Buffer.concat(parts)
    steps.push({ opcode: text ? OP.TEXT : OP.BINARY, payload: parts[0], fin: false })
    for (let i = 1; i < frags; i++) {
      if (rnd() < 0.4) {
        const ping = binaryPayload(rnd, Math.floor(rnd() * 20))
        steps.push({ opcode: OP.PING, payload: ping, fin: true })
        expected.push(`${OP.PONG}:${ping.toString('hex')}`)
      }
      steps.push({ opcode: OP.CONT, payload: parts[i], fin: i === frags - 1 })
    }
    expected.push(`${text ? OP.TEXT : OP.BINARY}:${full.toString('hex')}`)
  } else {
    const codePick = rnd()
    if (codePick < 0.3) {
      steps.push({ opcode: OP.CLOSE, payload: Buffer.alloc(0), fin: true })
    } else {
      const code = codePick < 0.65 ? 1000 : 3000 + Math.floor(rnd() * 1000)
      const reason = Buffer.from('bye-' + Math.floor(rnd() * 1000), 'utf8')
      const payload = Buffer.concat([Buffer.from([code >> 8, code & 0xff]), reason])
      steps.push({ opcode: OP.CLOSE, payload, fin: true })
      expected.push(`${OP.CLOSE}:${payload.toString('hex')}`)
    }
  }
  return { steps, expected }
}

function wireOf(steps: Step[], rnd: () => number): Buffer[] {
  const all = steps.map((s) => encodeFrame(s.opcode, s.payload, { fin: s.fin, mask: true }))
  const total = Buffer.concat(all)
  const chunks: Buffer[] = []
  let offset = 0
  while (offset < total.length) {
    const n = 1 + Math.floor(rnd() * 17)
    chunks.push(total.subarray(offset, offset + n))
    offset += n
  }
  return chunks
}

async function feed(c: RawWs, chunks: Buffer[]): Promise<void> {
  for (const chunk of chunks) {
    c.write(chunk)
    await new Promise((r) => setImmediate(r))
  }
}

function seqOf(c: RawWs): string[] {
  return c.frames.map((f) => `${f.opcode}:${f.payload.toString('hex')}`)
}

describe('RFC6455 差分对账（native vs ws）', () => {
  it('200 用例（4 种子 × 50）——帧序列逐字节一致', async () => {
    const app = () => {
      const a = new Router()
      a.ws('/ws', { message: (ws, _ctx, data) => ws.send(data) })
      return a
    }
    const native = serve(app(), { port: 0, wsAdapter: () => createNativeWsAdapter() })
    const wsSrv = serve(app(), { port: 0, wsAdapter: () => createWsAdapter() })
    await Promise.all([native.ready, wsSrv.ready])
    servers.push(native, wsSrv)

    let cases = 0
    for (let seed = 1; seed <= 4; seed++) {
      const rnd = mulberry32(seed * 7919)
      for (let i = 0; i < 50; i++) {
        const { steps, expected } = genCase(rnd)
        const chunks = wireOf(steps, rnd)
        const [ca, cb] = await Promise.all([rawWsConnect(native.port), rawWsConnect(wsSrv.port)])
        await Promise.all([feed(ca, chunks), feed(cb, chunks)])
        const want = expected.length
        try {
          await Promise.all([
            ca.waitFor(() => ca.frames.length >= want, 5000),
            cb.waitFor(() => cb.frames.length >= want, 5000),
          ])
        } catch {
          assert.fail(
            `seed=${seed} case=${i} 等待超时（want=${want}）\n`
              + `  steps=${steps.map((s) => `${s.opcode}/${s.payload.length}${s.fin ? 'F' : ''}`).join(',')}\n`
              + `  native=${JSON.stringify(seqOf(ca))}\n  ws=${JSON.stringify(seqOf(cb))}`,
          )
        }
        assert.deepEqual(
          seqOf(ca),
          seqOf(cb),
          `seed=${seed} case=${i} native≠ws steps=${steps.map((s) => `${s.opcode}/${s.payload.length}${s.fin ? 'F' : ''}`).join(',')}`,
        )
        assert.deepEqual(seqOf(ca), expected.slice(0, ca.frames.length), `seed=${seed} case=${i} 回显序列≠预期`)
        if (ca.closeFrame || cb.closeFrame) {
          assert.deepEqual(ca.closeFrame, cb.closeFrame, `seed=${seed} case=${i} 关闭码≠`)
        }
        ca.destroy()
        cb.destroy()
        cases++
      }
    }
    assert.equal(cases, 200)
  })
})
