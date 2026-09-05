/**
 * weifuwu/db — Redis AST（命令对象）+ parser/stringify 对称面
 *
 * 架构闭环（以 AST 为中心——对齐 Query Language）：
 *   RESP 字节 ⇄ parseCommand / stringifyCommand ⇄ RedisCommand AST
 *                                            ⇄ 命令注册表执行（MemoryRedis/服务器/真库）
 *
 * RedisCommand = { name, args }——过程式命令面天然 AST（无 SQL 式语法）：
 *   - parseCommand：RESP 数组 → AST（服务器入口：收到客户端字节 → 命令对象）
 *   - stringifyCommand：AST → RESP（客户端入口：命令对象 → 发送字节）
 *
 * 注册表（commands.ts）做类型化参数/arity 校验——MemoryRedis 与服务器共享执行面。
 */
import { encodeCommand, RespParser, decodeValue, type RespValue } from './resp.ts'
import { ProtocolError } from '../errors.ts'

/** Redis 命令 AST：命令名（大写）+ 参数列表 */
export interface RedisCommand {
  name: string
  args: (string | number)[]
}

/** 命令执行结果（RESP 值：字符串/数字/数组/null/错误） */
export type RedisValue = RespValue

export interface RedisReply {
  value: RedisValue
}

/**
 * RESP 数组 → RedisCommand AST（单命令解析——非流式）
 * 输入为客户端发送的完整命令字节（*N\r\n$len\r\n...\r\n 序列）
 */
export function parseCommand(input: string | Uint8Array): RedisCommand {
  const parser = new RespParser()
  const buf = typeof input === 'string' ? new TextEncoder().encode(input) : input
  const { value: v, incomplete } = parser.push(buf)
  if (incomplete || v === null) throw new ProtocolError('redis-ast: 不完整的 RESP 命令')
  if (!Array.isArray(v)) throw new ProtocolError(`redis-ast: 期望 RESP 数组命令，得到 ${typeof v}`)
  if (v.length === 0) throw new ProtocolError('redis-ast: 空命令')
  const decoded = decodeValue(v, true) as unknown[]
  const name = String(decoded[0])
  return { name: name.toUpperCase(), args: decoded.slice(1).map((a) => (typeof a === 'number' ? a : String(a))) }
}

/** RedisCommand AST → RESP 字节（客户端发送面）——真类型为字节（W1 守卫面实证：签名误写 string） */
export function stringifyCommand(cmd: RedisCommand | [string, ...(string | number)[]]): Uint8Array {
  if (Array.isArray(cmd) && (typeof cmd[0] === 'string' || typeof cmd[0] === 'number')) {
    return encodeCommand(cmd as [string, ...(string | number)[]])
  }
  const c = cmd as RedisCommand
  return encodeCommand([c.name, ...c.args])
}
