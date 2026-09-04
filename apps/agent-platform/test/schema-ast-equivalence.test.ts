/**
 * W1 等价契约（平台——最大声明面 24 表）：DDL AST 生成面 ddlToSql(compileSchemaDdl)
 * 与旧文本面 compileSchemaDDL 逐字相等——真库零漂移证明（协议层 = AST 后）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compileSchemaDdl, ddlToSql, compileSchemaDDL } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'

test('W1 等价（平台 24 表）：ddlToSql(compileSchemaDdl) === compileSchemaDDL 逐字', () => {
  const ast = compileSchemaDdl(AGENT_PLATFORM_SCHEMA as never)
  const fromAst = ddlToSql(ast)
  const oldText = compileSchemaDDL(AGENT_PLATFORM_SCHEMA as never)
  assert.equal(fromAst, oldText, 'AST→SQL 重建必须与旧文本面逐字相等')
})
