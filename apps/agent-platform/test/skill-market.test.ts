/**
 * C6 技能市场——评分/搜索（真库集成测试）
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { postgres } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'

let pg: ReturnType<typeof postgres>

before(async () => {
  pg = postgres({ memory: true })
  // 协议层 = AST：声明式建库（migrateModule——零 SQL 文本）
  await pg.migrateModule('test-full', AGENT_PLATFORM_SCHEMA as never)
})

after(async () => {
  await pg.close()
})

describe('C6 技能市场（评分/搜索）', () => {
  it('评分 upsert：同租户同技能可改评', async () => {
        const dir = '/skills/test/rate-a'
    const app1 = '00000000-0000-0000-0000-0000000000a1'
    // 首次点赞
    const [r1] = await pg.orm.query.insert('skill_ratings').rows([{ skill_dir: dir, app_id: app1, liked: true }]).onConflict(['skill_dir', 'app_id'], true).returning('liked').run()
    assert.strictEqual(r1.liked, true)
    // 改差评（upsert 不新增行）
    const [r2] = await pg.orm.query.insert('skill_ratings').rows([{ skill_dir: dir, app_id: app1, liked: false }]).onConflict(['skill_dir', 'app_id'], true).returning('liked').run()
    assert.strictEqual(r2.liked, false)
    const [cnt] = await pg.orm.query.from('skill_ratings').count('*', 'n', { skill_dir: { eq: dir }, app_id: { eq: app1 } }).run()
    assert.strictEqual(Number(cnt.n), 1, '改评不新增行')
  })

  it('评分聚合：全局 likes/dislikes', async () => {
        const dir = '/skills/test/rate-b'
    for (const [app, liked] of [
      ['00000000-0000-0000-0000-0000000000b1', true],
      ['00000000-0000-0000-0000-0000000000b2', true],
      ['00000000-0000-0000-0000-0000000000b3', false],
    ] as const) {
      await pg.orm.query.insert('skill_ratings').rows([{ skill_dir: dir, app_id: app, liked }]).onConflict(['skill_dir', 'app_id'], true).run()
    }
    // 聚合断言走 orm（COUNT FILTER 算子面——原生 SQL 聚合表达式面 parser 判负：
    // COALESCE/嵌套函数是开放面——业务/测试断言统一 orm）
    const agg = await pg.orm.query.from('skill_ratings').count('*', 'likes', { liked: { eq: true } }).count('*', 'dislikes', { liked: { eq: false } }).where({ skill_dir: { eq: dir } }).run()
    assert.strictEqual((agg as any)[0].likes, 2)
    assert.strictEqual((agg as any)[0].dislikes, 1)
  })

  it('租户隔离：A 租户评分不影响 B 租户数据', async () => {
        const dir = '/skills/test/rate-c'
    await pg.orm.query.insert('skill_ratings').rows([{ skill_dir: dir, app_id: '00000000-0000-0000-0000-0000000000c1', liked: true }]).run()
    const [mine] = await pg.orm.query.from('skill_ratings').count('*', 'n', { skill_dir: { eq: dir }, app_id: { eq: '00000000-0000-0000-0000-0000000000c2' } }).run()
    assert.strictEqual(mine.n, 0, '其他租户看不到我的评分')
  })
})
