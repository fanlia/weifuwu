/**
 * C6 技能市场——评分/搜索（真库集成测试）
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { postgres } from 'weifuwu'

let pg: ReturnType<typeof postgres>

before(async () => {
  pg = postgres(process.env.TEST_DATABASE_URL ?? 'postgres://root:123456@localhost:5432/demo_svc_test', { max: 10, closeTimeout: 1 })
  await pg.sql`CREATE TABLE IF NOT EXISTS skill_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_dir TEXT NOT NULL,
    app_id UUID NOT NULL,
    liked BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (skill_dir, app_id)
  )`
})

after(async () => {
  await pg.sql`DROP TABLE IF EXISTS skill_ratings`
  await pg.close()
})

describe('C6 技能市场（评分/搜索）', () => {
  it('评分 upsert：同租户同技能可改评', async () => {
    const sql = pg.sql
    const dir = '/skills/test/rate-a'
    const app1 = '00000000-0000-0000-0000-0000000000a1'
    // 首次点赞
    const [r1] = await sql`
      INSERT INTO skill_ratings (skill_dir, app_id, liked) VALUES (${dir}, ${app1}, TRUE)
      ON CONFLICT (skill_dir, app_id) DO UPDATE SET liked = EXCLUDED.liked
      RETURNING liked
    `
    assert.strictEqual(r1.liked, true)
    // 改差评（upsert 不新增行）
    const [r2] = await sql`
      INSERT INTO skill_ratings (skill_dir, app_id, liked) VALUES (${dir}, ${app1}, FALSE)
      ON CONFLICT (skill_dir, app_id) DO UPDATE SET liked = EXCLUDED.liked
      RETURNING liked
    `
    assert.strictEqual(r2.liked, false)
    const [cnt] = await sql`SELECT COUNT(*)::int AS n FROM skill_ratings WHERE skill_dir = ${dir} AND app_id = ${app1}`
    assert.strictEqual(cnt.n, 1, '改评不新增行')
  })

  it('评分聚合：全局 likes/dislikes', async () => {
    const sql = pg.sql
    const dir = '/skills/test/rate-b'
    for (const [app, liked] of [
      ['00000000-0000-0000-0000-0000000000b1', true],
      ['00000000-0000-0000-0000-0000000000b2', true],
      ['00000000-0000-0000-0000-0000000000b3', false],
    ] as const) {
      await sql`
        INSERT INTO skill_ratings (skill_dir, app_id, liked) VALUES (${dir}, ${app}, ${liked})
        ON CONFLICT (skill_dir, app_id) DO UPDATE SET liked = EXCLUDED.liked
      `
    }
    const [agg] = await sql`
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE liked), 0)::int AS likes,
        COALESCE(COUNT(*) FILTER (WHERE NOT liked), 0)::int AS dislikes
      FROM skill_ratings WHERE skill_dir = ${dir}
    `
    assert.strictEqual(agg.likes, 2)
    assert.strictEqual(agg.dislikes, 1)
  })

  it('租户隔离：A 租户评分不影响 B 租户数据', async () => {
    const sql = pg.sql
    const dir = '/skills/test/rate-c'
    await sql`INSERT INTO skill_ratings (skill_dir, app_id, liked) VALUES (${dir}, '00000000-0000-0000-0000-0000000000c1', TRUE)`
    const [mine] = await sql`SELECT COUNT(*)::int AS n FROM skill_ratings WHERE skill_dir = ${dir} AND app_id = '00000000-0000-0000-0000-0000000000c2'`
    assert.strictEqual(mine.n, 0, '其他租户看不到我的评分')
  })
})
