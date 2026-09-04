#!/usr/bin/env node
/**
 * shape 防回流守卫（E4）——DDL 列集 vs SHAPES 列集逐表 diff：
 *   - 缺列（DDL 有 shape 无）→ 打印推荐 shape 行模板（类型推断初稿——业务修饰人工定）
 *   - 多列（shape 有 DDL 无）→ 报告（shape 可能过时/列已删）
 *   - 无差异 → ✓ ok（exit 0）
 *   - 任何差异 exit 1（CI 可挂——新增列必须补 shape——对齐测试同源断言）
 *
 * 用法：node apps/agent-platform/scripts/shape-check.mjs
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectTableDefs } from './ddl-parse.ts'

const resolveApp = (...p) => resolve(dirname(fileURLToPath(import.meta.url)), '..', ...p)
const SCHEMA = readFileSync(resolveApp('src', 'db', 'schema.sql'), 'utf-8')
const RUNTIME = readFileSync(resolveApp('server.ts'), 'utf-8')

const { SHAPES } = await import(resolveApp('src', 'db', 'shapes.ts'))

const defs = collectTableDefs(SCHEMA, RUNTIME)
const failures = []
const templates = []

/** 列定义 → 推荐 shape 行（类型推断初稿——f.col 映射恒等（平台决策——键=列名）；业务修饰人工定） */
function shapeLine(def) {
  const init = def.raw
  const col = def.name
  const hasNull = /\bNULL\b/i.test(init) && !/\bNOT\s+NULL\b/i.test(init)
  const hasDefault = /\bDEFAULT\b/i.test(init)
  const isPk = /\bPRIMARY\s+KEY\b/i.test(init)
  const isUuidCol = /uuid\b/i.test(init)
  const intLike = /\bint\d*\b|bigint|serial/i.test(init)
  const isBool = /boolean/i.test(init)
  const isJsonb = /jsonb/i.test(init)
  const isTs = /timestamp|date\b/i.test(init)
  let core = isUuidCol ? 'uuid()' : intLike ? 'int()' : isBool ? 'bool()' : isJsonb ? 'jsonb()' : isTs ? 'ts()' : 'text()'
  let line
  if (isPk) line = `f.pk(${core})`
  else if (!hasNull && !hasDefault) line = `f.req(${core})`
  else if (hasDefault && !hasNull) {
    const dfl = /DEFAULT\s+(?:(\d+)|(true|false|TRUE|FALSE)|(gen_random_uuid\(\)|now\(\)|CURRENT_TIMESTAMP))/i.exec(init)
    if (dfl && dfl[1] !== undefined) line = `dflt(f.req(${core}), ${dfl[1]})`
    else if (dfl && (dfl[2] !== undefined)) line = `dflt(f.req(${core}), ${dfl[2].toLowerCase()})`
    else line = `f.req(${core})`
  } else if (hasNull) {
    line = `${core}.nullable()`
  } else {
    line = `${core}.nullable()`
  }
  return `  ${col}: ${line},`
}

for (const [table, cols] of defs) {
  const shape = SHAPES[table]
  if (!shape) {
    failures.push(`表 ${table}：DDL 存在但 SHAPES 无定义（需补 shape 表）`)
    continue
  }
  const shapeCols = new Set(Object.keys(shape))
  for (const c of cols) {
    if (!shapeCols.has(c.name)) {
      failures.push(`表 ${table}：缺列 ${c.name}`)
      templates.push(`// ${table} 缺列模板（类型推断初稿——业务修饰（enum/变体/默认值语义）人工确认）:\n${shapeLine(c)}`)
    }
  }
  for (const s of Object.keys(shape)) {
    if (!cols.some((c) => c.name === s)) failures.push(`表 ${table}：SHAPES 多列 ${s}（DDL 无——确认列已删或解析遗漏）`)
  }
}

if (failures.length > 0) {
  console.error('✖ shape 与 DDL 列集不一致：')
  for (const f of failures) console.error('  -', f)
  if (templates.length > 0) console.error('\n' + templates.join('\n'))
  process.exit(1)
}
console.log(`✓ shape 对齐（${defs.size} 表 · 逐列一致）`)
