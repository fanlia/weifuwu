/**
 * 循环死锁 fuzz：parser / tokenizer / RESP / PG 消息流对恶意输入不死循环
 * （每次输入带超时保护——卡死则子进程被杀 = 测试失败）
 */
import { parseSqlToAst } from '../db/sql-parser.ts'
import { parseCommand } from '../db/redis/ast.ts'
import { RespParser } from '../db/redis/resp.ts'
import { MessageStream } from '../db/postgres/protocol.ts'

/** 恶意输入集：不闭合引号/括号、超长数字、负号、特殊字符、截断协议帧 */
const inputs = [
  // tokenizer 边界
  "SELECT '", // 不闭合引号
  "SELECT 'abc", 
  "SELECT -",
  "SELECT -1",
  "SELECT --",
  "SELECT 1-",
  "SELECT 1-2",
  "SELECT 1--2",
  "SELECT (-9007199254740993)::bigint",
  "SELECT (",
  "SELECT ((",
  "SELECT (((",
  "SELECT )",
  "SELECT a)",
  "SELECT $",
  "SELECT $$",
  "SELECT $999999999",
  "SELECT 1e",
  "SELECT 1.2.3",
  "SELECT '\\",
  "SELECT ''",
  "SELECT '''",
  "SELECT * FROM (SELECT 1",
  "SELECT * FROM (",
  "SELECT * FROM (SELECT 1 AS x) t WHERE 1 = 0",
  "INSERT INTO t VALUES (",
  "INSERT INTO t VALUES (1",
  "INSERT INTO t VALUES (1),",
  "UPDATE t SET a = ",
  "DELETE FROM t WHERE ",
  "CREATE TABLE t (",
  "CREATE TABLE t (a",
  "CREATE TABLE t (a INT,",
  "CREATE TABLE t (a INT REFERENCES x(",
  // WHERE 边界
  "SELECT * FROM t WHERE ",
  "SELECT * FROM t WHERE a = ",
  "SELECT * FROM t WHERE (a = 1",
  "SELECT * FROM t WHERE a IN (",
  "SELECT * FROM t WHERE a IS ",
  "SELECT * FROM t WHERE a = 1 OR ",
  "SELECT * FROM t WHERE a = 1 AND (b = 2 OR ",
  // 特殊字符
  "SELECT \\0",
  "SELECT \x00\x01\x02",
  "SELECT ,",
  ",,,,",
  "SELECT 1 AS ",
  "SELECT 1 AS ",
  "SELECT 'a' 'b'",
  "SELECT 'a', 'b",
  // 超长
  "SELECT " + '1'.repeat(10000),
  "SELECT '" + 'a'.repeat(100000),
  "SELECT " + 'x,'.repeat(5000),
  // 空/杂
  '',
  ' ',
  ';',
  ';;',
  '\n\n',
  '/* comment */',
]

let deadlock = 0
let errors = 0
let start = Date.now()

for (const input of inputs) {
  // 1. SQL parser
  try { parseSqlToAst(input, []) } catch (e) {
    if (e instanceof Error && e.message.includes('not supported by weifuwu/db')) errors++
    // ProtocolError 正常；其他错误也应被捕获（不崩溃）
  }
  // 2. RESP 解析（单命令）
  try { parseCommand(input) } catch { /* 不完整/错误输入——捕获 */ }
  // 3. RESP 流式
  try {
    const p = new RespParser()
    p.push(new TextEncoder().encode(input))
  } catch { /* ignore */ }
  // 4. PG 消息流（截断帧——len 大）
  try {
    const ms = new MessageStream()
    ms.push(new TextEncoder().encode(input))
  } catch { /* ignore */ }
  // 5. PG 消息流 + 伪造大帧头（len 0xFFFFFFFF——解析应 null 不越界）
  try {
    const ms = new MessageStream()
    ms.push(new Uint8Array([0x51, 0xff, 0xff, 0xff, 0xff, 0x61, 0x62]))
  } catch { /* ignore */ }
}

const elapsed = Date.now() - start
console.log(`fuzz done: ${inputs.length} inputs, ${elapsed}ms, ProtocolError=${errors}, no deadlock`)
