/**
 * vdom core — 传输层合规（R6——NDJSON 命令流——design/vdom-core-robustness-round4.md P2）
 *
 * 覆盖：
 * - 跨 chunk 半行（任意字节切分——1 字节步进——解析正确——行缓冲语义）
 * - 尾部无换行（最后命令无 \n——完整解析）
 * - 空行容错（\n\n 中间空行跳过）
 * - 畸形行 → 显式 throw（不静默——serve catch 自愈链）
 * - reviveFn：$fn 无键 → console.error 违例报告 + undefined（不静默）
 * - encode 往返（函数面 → $fn 标记 → 还原）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeCommands, reviveFn, commandReader } from '../../client/vdom/core/serve.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()

function bytesOf(lines: string[]): Uint8Array {
  return enc.encode(lines.join('\n') + (lines.at(-1)?.endsWith('\n') ? '' : '\n'))
}

async function parseAll(chunks: Uint8Array[], fnTable = new Map<number, unknown>()): Promise<Command[]> {
  const stream = new ReadableStream<Uint8Array>({
    start(c) { for (const ch of chunks) c.enqueue(ch); c.close() },
  })
  const out: Command[] = []
  for await (const cmd of commandReader(stream.getReader(), fnTable)) out.push(cmd)
  return out
}

function sampleCmd(extra: Record<string, unknown> = {}): Command {
  return { op: 'create', id: 'root.0', tag: 'div', ...extra } as unknown as Command
}

test('R6a：跨 chunk 半行——1 字节步进切分仍解析正确', async () => {
  const lines = [JSON.stringify(sampleCmd()), JSON.stringify({ ...sampleCmd(), id: 'root.1', tag: 'span' })]
  const raw = bytesOf(lines)
  // 逐字节切（最坏边界）
  const chunks: Uint8Array[] = []
  for (let i = 0; i < raw.length; i++) chunks.push(raw.slice(i, i + 1))
  const cmds = await parseAll(chunks)
  assert.equal(cmds.length, 2, '两条命令完整解析')
  assert.equal(cmds[0].id, 'root.0')
  assert.equal((cmds[1] as { tag: string }).tag, 'span')
})

test('R6b：尾部无换行 + 空行容错', async () => {
  const cmds = await parseAll([
    enc.encode(JSON.stringify(sampleCmd()) + '\n\n' + JSON.stringify({ ...sampleCmd(), id: 'x' })), // 中间空行
  ])
  assert.equal(cmds.length, 2)
  assert.equal(cmds[1].id, 'x')
  // 多 chunk 末尾无 \n（最后 chunk 无换行符）
  const raw = enc.encode(JSON.stringify(sampleCmd()))
  const cmds2 = await parseAll([raw.slice(0, 5), raw.slice(5)])
  assert.equal(cmds2.length, 1)
})

test('R6c：畸形行 → 显式 throw（不静默——serve catch 自愈链接管）', async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(enc.encode('{invalid json\n')); c.close() },
  })
  await assert.rejects(
    (async () => { for await (const _ of commandReader(stream.getReader(), new Map())) { /* 空消费 */ } })(),
    SyntaxError,
    '畸形行必须显式抛错（上层自愈——不静默吞）',
  )
})

test('R6d：reviveFn——$fn 无键 → console.error 违例 + undefined（不静默）', () => {
  const errors: string[] = []
  const orig = console.error
  console.error = (msg: unknown) => { errors.push(String(msg)) }
  try {
    const revive = reviveFn(new Map())
    const v = revive('k', { $fn: 99 })
    assert.equal(v, undefined, '无键还原为 undefined（不伪造）')
    assert.ok(errors.some((e) => e.includes('$fn:99')), '必须报告传输违例')
  } finally {
    console.error = orig
  }
})

test('R6e：encode → commandReader 往返（函数面 → $fn → 还原）', async () => {
  const fnTable = new Map<number, unknown>()
  const onOk = () => {}
  const stream = encodeCommands(
    new ReadableStream<Command>({ start(c) { c.enqueue({ ...sampleCmd(), onClick: onOk } as unknown as Command); c.close() } }),
    fnTable,
  )
  // 读回字节
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) { const { value, done } = await reader.read(); if (done) break; chunks.push(value) }
  const cmds = await parseAll(chunks, fnTable)
  assert.equal((cmds[0] as unknown as { onClick: unknown }).onClick, onOk, '函数引用还原（同进程共享表）')
})
