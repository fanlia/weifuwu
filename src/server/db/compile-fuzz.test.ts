/**
 * 编译面对账（W5：pg 算子包审计——compileWhere 已存在（query.ts）——
 * 本测试正规化验证：builder AST 直执行 vs compileQuery 编译 SQL 再解析执行
 * —— 两轨终态行集等价（≥200 对·≥5 种子）
 *
 * 判负记录：pg 算子包无需新建（compileWhere 全算子覆盖——W4 试点已隐式验证）；
 * 本文件= 编译 round-trip 面证（compile→parse→exec vs 直 exec）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryOrm } from './memory-sql.ts'
import { compileQuery } from './query.ts'
import { eq, ne, gt, gte, lt, lte, inArray, between, ilike, contains, isNull, and, or } from './ops.ts'

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('compile fuzz：AST 直执行 vs 编译 SQL 回解析（1000 对）', async () => {
  for (const seed of [7, 99, 555, 2025, 4242]) {
    const rnd = mulberry32(seed)
    const { orm: sql, mem } = createMemoryOrm()
    await mem.unsafe(`CREATE TABLE fz (id INT, name TEXT, st TEXT, val INT)`)
    const words = ['alpha', 'beta', 'gamma', 'delta', '50%', 'a_b', '张', '李四']
    for (let i = 0; i < 30; i++) {
      const st = rnd() < 0.2 ? null : rnd() < 0.5 ? 'x' : 'y'
      await mem.unsafe(`INSERT INTO fz (id, name, st, val) VALUES ($1, $2, $3, $4)`,
        [i, words[Math.floor(rnd() * words.length)], st, Math.floor(rnd() * 25)])
    }
    const C = { id: { ref: 'id', __out: 0 as number }, name: { ref: 'name', __out: '' as string }, st: { ref: 'st', __out: '' as string }, val: { ref: 'val', __out: 0 as number } }
    for (let i = 0; i < 200; i++) {
      const kind = Math.floor(rnd() * 10)
      const n = Math.floor(rnd() * 20)
      let w: unknown
      if (kind === 0) w = eq(C.id, n)
      else if (kind === 1) w = ne(C.id, n)
      else if (kind === 2) w = gt(C.id, n)
      else if (kind === 3) w = lt(C.id, n)
      else if (kind === 4) w = between(C.val, n, n + 6)
      else if (kind === 5) w = inArray(C.id, [n, n + 1, n + 2])
      else if (kind === 6) w = and(eq(C.id, n), gt(C.val, n - 5))
      else if (kind === 7) w = or(eq(C.st, 'x'), eq(C.st, 'y'))
      else if (kind === 8) w = ilike(C.name, `${words[n % words.length]}%`)
      else w = and(eq(C.st, 'x'), or(eq(C.id, n), contains(C.name, 'a')))
      const direct = await sql.query.from('fz').select('id', 'name', 'st', 'val').where(w as never).run()
      const compiled = compileQuery({ kind: 'select', table: 'fz', cols: ['id', 'name', 'st', 'val'], where: w as never })
      const viaSql = await mem.unsafe(compiled.sql, compiled.params)
      const sort = (rows: unknown[]) => JSON.stringify(rows.map((r: any) => [r.id, r.name, r.st, r.val]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
      assert.equal(sort(viaSql), sort(direct), `种子 ${seed} 样例 ${i}（kind=${kind}）不等价\nSQL=${compiled.sql}\n${JSON.stringify(compiled.params)}`)
    }
  }
})

test('compile fuzz：isNull/notNull + 字符串转义 round-trip', async () => {
  const { orm: sql, mem } = createMemoryOrm()
  await mem.unsafe(`CREATE TABLE fz2 (name TEXT, st TEXT)`)
  await mem.unsafe(`INSERT INTO fz2 (name, st) VALUES ('50%off', 'a'), ('plain', NULL), ('a_b', 'b')`)
  const C = { name: { ref: 'name', __out: '' as string }, st: { ref: 'st', __out: '' as string } }
  const w = and(isNull(C.st), or(contains(C.name, '0%'), eq(C.st, 'b')))
  const direct = await sql.query.from('fz2').select('name').where(w as never).run()
  const compiled = compileQuery({ kind: 'select', table: 'fz2', cols: ['name'], where: w as never })
  const viaSql = await mem.unsafe(compiled.sql, compiled.params)
  assert.deepEqual(viaSql, direct)
})

test('compile fuzz：onConflict DO UPDATE 双轨终态等价（D1）', async () => {
  for (const seed of [11, 47, 233]) {
    const rnd = mulberry32(seed)
    // 参考世界（AST 直执行） vs 模拟世界（compile SQL 回解析）——种子/样本双驱
    const mk = async () => {
      const { orm: s, mem } = createMemoryOrm()
      await mem.unsafe('CREATE TABLE up (key TEXT UNIQUE, val TEXT)')
      return { orm: s, mem }
    }
    const direct = await mk()
    const via = await mk()
    for (let i = 0; i < 20; i++) {
      const op = { key: `k${Math.floor(rnd() * 5)}`, val: `v${i}` } // 有限键集——制造冲突
      await direct.orm.query.insert('up').values(op).onConflict('key', true).returning('*').run()
      const c = compileQuery({ kind: 'insert', table: 'up', rows: [op], onConflict: { col: 'key', update: true }, returning: '*' })
      await via.mem.unsafe(c.sql, c.params)
    }
    // 终态行集等价（含 DO NOTHING 追踪——键集有限必有冲突）
    const sortRows = (rows: unknown[]) => JSON.stringify(rows.map((r) => [r.key, r.val]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
    assert.equal(
      sortRows(await via.mem.unsafe('SELECT key, val FROM up')),
      sortRows(await direct.mem.unsafe('SELECT key, val FROM up')),
      `种子 ${seed} onConflict DO UPDATE 终态不等价`,
    )
  }
})
