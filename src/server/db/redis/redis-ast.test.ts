/**
 * Redis AST 层测试：parseCommand/stringifyCommand 往返 + 命令注册表校验
 * 以 AST 为中心：RESP 字节 ⇄ RedisCommand ⇄ 注册表执行
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand, stringifyCommand } from './ast.ts'
import { resolveCommand } from './commands.ts'
import { ProtocolError } from '../errors.ts'
import { RespParser, decodeValue } from './resp.ts'

function respParse(buf: string): unknown {
  const p = new RespParser()
  return decodeValue(p.push(new TextEncoder().encode(buf)).value, true)
}

test('stringifyCommand → parseCommand 往返（SET 带参数）', () => {
  const resp = stringifyCommand({ name: 'SET', args: ['k', 'v', 'EX', 60] })
  const cmd = parseCommand(resp)
  assert.equal(cmd.name, 'SET')
  assert.deepEqual(cmd.args, ['k', 'v', 'EX', '60'])
})

test('往返：无参数命令（PING）与多参数命令（XADD）', () => {
  const ping = parseCommand(stringifyCommand({ name: 'PING', args: [] }))
  assert.deepEqual(ping, { name: 'PING', args: [] })
  const xadd = parseCommand(stringifyCommand(['XADD', 'queue', '*', 'payload', 'hello']))
  assert.deepEqual(xadd.name, 'XADD')
  assert.deepEqual(xadd.args, ['queue', '*', 'payload', 'hello'])
})

test('parseCommand：数字参数还原（EXPIRE ttl）', () => {
  const cmd = parseCommand(stringifyCommand({ name: 'EXPIRE', args: ['key', 3600] }))
  assert.deepEqual(cmd.args, ['key', '3600'])
})

test('二进制安全：参数含换行/二进制不破坏协议', () => {
  const resp = stringifyCommand({ name: 'SET', args: ['k\n1', 'v\r\n2'] })
  const cmd = parseCommand(resp)
  assert.deepEqual(cmd.args, ['k\n1', 'v\r\n2'])
})

test('parseCommand：不完整输入抛 ProtocolError', () => {
  assert.throws(() => parseCommand('*2\r\n$3\r\nGE'), ProtocolError)
})

test('parseCommand：非数组 RESP 抛（服务器回复不是命令）', () => {
  assert.throws(() => parseCommand('+OK\r\n'), ProtocolError)
})

test('注册表：unknown 命令抛（诚实裁剪可预测失败）', () => {
  assert.throws(() => resolveCommand({ name: 'NOPE', args: [] }), /unknown command/)
})

test('注册表：arity 校验（GET 缺参抛）', () => {
  assert.throws(() => resolveCommand({ name: 'GET', args: [] }), /wrong number of arguments/)
  assert.throws(() => resolveCommand({ name: 'GET', args: ['a', 'b'] }), /wrong number of arguments/)
})

test('注册表：SET EX/PX 规范化毫秒 meta', () => {
  const { parsed } = resolveCommand({ name: 'SET', args: ['k', 'v', 'EX', 60] })
  assert.deepEqual(parsed.args, ['k', 'v'])
  assert.equal(parsed.meta?.ttl, 60_000)
  const px = resolveCommand({ name: 'SET', args: ['k', 'v', 'PX', 500] })
  assert.equal(px.parsed.meta?.ttl, 500)
  const keep = resolveCommand({ name: 'SET', args: ['k', 'v', 'KEEPTTL'] })
  assert.equal(keep.parsed.meta?.keepTtl, true)
})

test('注册表：SET 非法选项抛', () => {
  assert.throws(() => resolveCommand({ name: 'SET', args: ['k', 'v', 'XX'] }), /syntax error/)
})

test('注册表：EXPIRE ttlMs 提取', () => {
  const { parsed } = resolveCommand({ name: 'EXPIRE', args: ['key', 120] })
  assert.equal(parsed.meta?.ttlMs, 120_000)
})

test('注册表：BLPOP 超时解析', () => {
  const { parsed } = resolveCommand({ name: 'BLPOP', args: ['q', 0.5] })
  assert.equal(parsed.meta?.timeoutMs, 500)
})

test('协议闭环：服务器应答 RESP 与命令编解码独立（encodeReply 语义不受影响）', () => {
  // 服务器回复（非命令）不应被 parseCommand 接受——AST 只面向命令面
  const ok = respParse('+OK\r\n')
  assert.equal(ok, 'OK')
  const int = respParse(':42\r\n')
  assert.equal(int, 42)
  const arr = respParse('*2\r\n$3\r\nfoo\r\n$3\r\nbar\r\n')
  assert.deepEqual(arr, ['foo', 'bar'])
})
