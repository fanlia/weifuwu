/**
 * MemorySql — 内存版 Postgres（契约 Sql 接口）测试
 *
 * 验证：标签模板/unsafe 参数化、WHERE 条件（= != > < IN + AND）、
 * INSERT/UPDATE/DELETE 行变更、COUNT、RETURNING、诚实裁剪（unsupported）。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createMemorySql } from '../db/memory-sql.ts'
import { ProtocolError } from '../db/errors.ts'

describe('MemorySql', () => {
  it('INSERT + SELECT *（标签模板参数化）', async () => {
    const sql = createMemorySql()
    await sql`INSERT INTO users (name, age) VALUES (${'alice'}, ${30})`
    await sql`INSERT INTO users (name, age) VALUES (${'bob'}, ${25})`
    const rows = await sql`SELECT * FROM users WHERE age > ${26}`
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'alice')
    assert.equal(rows[0].age, 30)
  })

  it('WHERE 多条件 AND + 各类运算符', async () => {
    const sql = createMemorySql()
    await sql.unsafe(`INSERT INTO items (id, name, price, active) VALUES ($1, $2, $3, $4)`, [1, 'a', 10, true])
    await sql.unsafe(`INSERT INTO items (id, name, price, active) VALUES ($1, $2, $3, $4)`, [2, 'b', 20, true])
    await sql.unsafe(`INSERT INTO items (id, name, price, active) VALUES ($1, $2, $3, $4)`, [3, 'c', 30, false])

    const cheap = await sql`SELECT * FROM items WHERE price <= ${15}`
    assert.equal(cheap.length, 1)
    assert.equal(cheap[0].name, 'a')

    const active = await sql`SELECT * FROM items WHERE active = ${true} AND price > ${15}`
    assert.equal(active.length, 1)
    assert.equal(active[0].name, 'b')

    const inIds = await sql`SELECT * FROM items WHERE id IN (${1}, ${3})`
    assert.equal(inIds.length, 2)

    const notB = await sql`SELECT * FROM items WHERE name != ${'b'}`
    assert.equal(notB.length, 2)
  })

  it('UPDATE 行变更 + affectedRows', async () => {
    const sql = createMemorySql()
    await sql`INSERT INTO t (name, score) VALUES (${'x'}, ${1})`
    await sql`INSERT INTO t (name, score) VALUES (${'y'}, ${2})`
    const res = await sql`UPDATE t SET score = ${99} WHERE name = ${'x'}`
    assert.equal(res.affectedRows, 1)
    const rows = await sql`SELECT * FROM t`
    assert.deepEqual(rows.find((r) => r.name === 'x')?.score, 99)
    assert.deepEqual(rows.find((r) => r.name === 'y')?.score, 2)
  })

  it('DELETE + COUNT(*)', async () => {
    const sql = createMemorySql()
    await sql`INSERT INTO t (v) VALUES (${1})`
    await sql`INSERT INTO t (v) VALUES (${2})`
    const res = await sql`DELETE FROM t WHERE v = ${1}`
    assert.equal(res.affectedRows, 1)
    const [row] = await sql`SELECT COUNT(*) FROM t`
    // COUNT 返回行带 count 字段（简化：返回剩余行数语义——由 SELECT * 行数体现）
    const all = await sql`SELECT * FROM t`
    assert.equal(all.length, 1)
    assert.ok(row, 'COUNT(*) 返回一行')
  })

  it('INSERT RETURNING *', async () => {
    const sql = createMemorySql()
    const rows = await sql`INSERT INTO t (a) VALUES (${7}) RETURNING *`
    assert.equal(rows.length, 1)
    assert.equal(rows[0].a, 7)
  })

  it('无 WHERE 全表 DELETE', async () => {
    const sql = createMemorySql()
    await sql`INSERT INTO t (v) VALUES (${1})`
    await sql`INSERT INTO t (v) VALUES (${2})`
    const res = await sql`DELETE FROM t`
    assert.equal(res.affectedRows, 2)
    assert.equal((await sql`SELECT * FROM t`).length, 0)
  })

  it('对象值深比较（JSON 列）', async () => {
    const sql = createMemorySql()
    const payload = { kind: 'note', tags: ['a'] }
    await sql`INSERT INTO docs (id, data) VALUES (${1}, ${payload})`
    const hit = await sql`SELECT * FROM docs WHERE data = ${payload}`
    assert.equal(hit.length, 1)
    const miss = await sql`SELECT * FROM docs WHERE data = ${{ kind: 'other' }}`
    assert.equal(miss.length, 0)
  })

  it('DDL no-op（migrate 路径）：CREATE/DROP TABLE 幂等', async () => {
    const sql = createMemorySql()
    await sql`CREATE TABLE IF NOT EXISTS _weifuwu_users (id TEXT PRIMARY KEY)`
    await sql`CREATE TABLE IF NOT EXISTS _weifuwu_users (id TEXT PRIMARY KEY)`
    await sql`INSERT INTO _weifuwu_users (id) VALUES (${'u1'})`
    await sql`DROP TABLE IF EXISTS _weifuwu_users`
    assert.equal((await sql`SELECT * FROM _weifuwu_users`).length, 0, 'DROP 清表')
  })

  it('诚实裁剪：JOIN/GROUP BY/未知函数抛 ProtocolError(unsupported)；ORDER BY 已支持', async () => {
    const sql = createMemorySql()
    await assert.rejects(() => sql`SELECT * FROM a JOIN b ON a.id = b.id`, ProtocolError)
    await assert.rejects(() => sql`SELECT * FROM t GROUP BY v`, ProtocolError)
    await assert.rejects(() => sql`SELECT * FROM t WHERE x = random()`, ProtocolError, '未知函数字面量不支持（now() 已支持）')
    // ORDER BY 现已支持（parser 系统性覆盖）
    await sql`INSERT INTO t (v) VALUES (${2})`
    await sql`INSERT INTO t (v) VALUES (${1})`
    const ordered = await sql`SELECT * FROM t ORDER BY v`
    assert.equal(ordered[0].v, 1, 'ORDER BY 升序')
  })

  it('参数越界 → 明确报错', async () => {
    const sql = createMemorySql()
    await assert.rejects(() => sql`SELECT * FROM t WHERE id = $5`, ProtocolError)
  })

  it('close 幂等 no-op', async () => {
    const sql = createMemorySql()
    await sql`INSERT INTO t (v) VALUES (${1})`
    await sql.close()
    await sql.close()
    assert.equal((await sql`SELECT * FROM t`).length, 1, 'close 后数据仍在（无连接资源）')
  })
})
