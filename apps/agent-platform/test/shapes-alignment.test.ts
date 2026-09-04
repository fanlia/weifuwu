/**
 * shapes ↔ schema.sql + server.ts 运行时 DDL 逐列对齐契约（P0/P2——新增列必须补 shape）
 *
 * 解析面（与 MemoryPostgresServer/schema 加载同源——文本直读）：
 *   - CREATE TABLE IF NOT EXISTS X (...) 主体（引号感知括号配对）
 *   - ALTER TABLE X ADD COLUMN [IF NOT EXISTS] name（agents/messages 增量列）
 * 双源：src/db/schema.sql（23 表）+ server.ts 运行时 CREATE/ALTER（4 表 + 增量列）。
 * 框架表（_weifuwu_*）不在平台 27 表内——排除。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHAPES } from '../src/db/shapes.ts'
// E4：解析器单源共享（scripts/ddl-parse.ts——shape-check.mjs 同源）
import { collectTables } from '../scripts/ddl-parse.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMA = readFileSync(resolve(__dirname, '..', 'src', 'db', 'schema.sql'), 'utf-8')
const RUNTIME = readFileSync(resolve(__dirname, '..', 'server.ts'), 'utf-8')

test('shapes ↔ schema.sql + server.ts 运行时 DDL：29 表逐列对齐（双向无差）', () => {
  const schema = collectTables(SCHEMA, RUNTIME)
  const shapeNames = Object.keys(SHAPES)
  assert.equal(shapeNames.length, 29, 'shape 表数 = 29')
  for (const name of shapeNames) {
    const sc = schema.get(name)
    assert.ok(sc, `shape 有表 ${name} 但 schema 无（或未解析到）`)
    const shapeKeys = Object.keys(SHAPES[name as keyof typeof SHAPES]).sort()
    assert.deepEqual(shapeKeys, [...sc].sort(), `表 ${name} 列集不对齐`)
  }
  // 反向：schema 每一表都有 shape
  for (const name of schema.keys()) {
    assert.ok(name in SHAPES, `schema 表 ${name} 缺 shape`)
  }
})
