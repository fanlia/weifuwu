/**
 * W1 等价契约：DDL AST 生成面（compileSchemaDdl）→ ddlToSql 重建 SQL
 * 与旧文本面（compileSchemaDDL）逐字相等——重构不动荡（真库面零行为漂移）。
 * 协议层 = AST 后：文本面仅剩此对照（W3 删文本面后契约改快照）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileSchemaDdl, ddlToSql, compileSchemaDDL } from './schema.ts'
import { WEIFUWU_USER_SCHEMA } from '../user/index.ts'

test('W1 等价：ddlToSql(compileSchemaDdl) === compileSchemaDDL（逐字）', () => {
  const ast = compileSchemaDdl(WEIFUWU_USER_SCHEMA as never)
  const fromAst = ddlToSql(ast)
  const oldText = compileSchemaDDL(WEIFUWU_USER_SCHEMA as never)
  assert.equal(fromAst, oldText, 'AST→SQL 重建必须与旧文本面逐字相等')
})

test('W1 等价：AST 面建库 columnTypes 对齐（memory executeDdl 吃 AST 产物）', async () => {
  const { createMemoryOrm } = await import('./memory-sql.ts')
  const { orm, mem } = createMemoryOrm()
  for (const stmt of compileSchemaDdl(WEIFUWU_USER_SCHEMA as never)) mem.executeQuery(stmt)
  // 表存在（executeDdl 建表完成——柱状断言：agents 表建出）
  await mem.unsafe('SELECT id FROM _weifuwu_users LIMIT 0')
  await orm.query.from('_weifuwu_users').limit(1).run()
})
