/**
 * weifuwu/db — SQL Parser（字符串 → Query Language AST）
 *
 * 架构闭环（单一中间表示）：
 *   SQL 字符串 → parseSqlToAst（本文件：tokenizer + 递归下降）
 *     → Query Language AST
 *       ├─ compileQuery：AST → 参数化 SQL（真库 stringify）
 *       └─ executeQuery：AST → 内存直执行（MemorySql）
 *
 * 覆盖（系统性语法规则——非正则打补丁）：
 *   SELECT（投影/别名/常量/表达式/UNION ALL/派生表/WHERE 全操作符 + AND OR/
 *     IS NULL/IN/ORDER BY/LIMIT）
 *   INSERT（多行 VALUES/RETURNING/无列名/ON CONFLICT）
 *   UPDATE / DELETE（SET/WHERE/RETURNING）
 *   表达式：$n 参数/cast（::type）/算术（加减乘除）/now()/引号字符串
 *
 * 诚实裁剪：JOIN/GROUP BY/HAVING/子查询（EXISTS/IN 子查询）/窗口函数——
 *   抛 ProtocolError（真库/Query Language 结构化路径使用）。
 */
import type { Query, SelectQuery, InsertQuery, UpdateQuery, DeleteQuery, WhereExpr, WhereField, RawSql, DdlQuery } from './query.ts'
import { addWhereCond } from './query.ts'
import { ProtocolError } from './errors.ts'

// ── Tokenizer ─────────────────────────────────────────────

type TokenType = 'ident' | 'string' | 'number' | 'param' | 'op' | 'lparen' | 'rparen' | 'comma' | 'star' | 'eof'

interface Token {
  type: TokenType
  value: string
}

function tokenize(sql: string): Token[] {
  // 状态机词法：Start → (InString/InNumber/InIdent/InParam) → Start
  // 循环不变量：每轮 i 严格前进 ≥1 或抛 ProtocolError——空消费路径物理不可能
  // 字符分类 charCodeAt 查表 O(1)（替代逐字符正则 + ops 线性扫描）
  const tokens: Token[] = []
  let i = 0
  const n = sql.length
  while (i < n) {
    const start = i
    const c = sql.charCodeAt(i)
    // ── 空白（状态：Start → Start，消费）──
    if (c === 32 || c === 9 || c === 10 || c === 13) { i++; continue }
    // ── 单字符符号（状态转移：消费 1 字符 → 产 token）──
    if (c === 40) { tokens.push({ type: 'lparen', value: '(' }); i++; continue }
    if (c === 41) { tokens.push({ type: 'rparen', value: ')' }); i++; continue }
    if (c === 44) { tokens.push({ type: 'comma', value: ',' }); i++; continue }
    if (c === 42) { tokens.push({ type: 'star', value: '*' }); i++; continue }
    // ── 引号标识符状态（" 包标识符——PG 大小写敏感；"" 内转义）──
    if (c === 34) {
      let j = i + 1
      let qs = ''
      while (j < n) {
        const qc = sql.charCodeAt(j)
        if (qc === 34) {
          if (sql.charCodeAt(j + 1) === 34) { qs += '"'; j += 2; continue }
          break
        }
        qs += sql[j]
        j++
      }
      tokens.push({ type: 'ident', value: qs })
      if (j >= n) throw new ProtocolError(`memory-sql: 引号标识符未闭合（位置 ${i}）`)
      i = j + 1
      continue
    }
    // ── 参数状态（$ 后数字；无数字则 $ 单独——值解析时抛）──
    if (c === 36) {
      let j = i + 1
      while (j < n && sql.charCodeAt(j) >= 48 && sql.charCodeAt(j) <= 57) j++
      tokens.push({ type: 'param', value: sql.slice(i, j) })
      i = j // j > i——严格前进
      continue
    }
    // ── 字符串状态（'' 转义；未闭合消费到结尾——i 前进退出）──
    if (c === 39) {
      let j = i + 1
      let s = ''
      while (j < n) {
        const sc = sql.charCodeAt(j)
        if (sc === 39) {
          if (sql.charCodeAt(j + 1) === 39) { s += "'"; j += 2; continue }
          break
        }
        s += sql[j]
        j++
      }
      tokens.push({ type: 'string', value: s })
      i = j + 1 // ≥ i+2——严格前进
      continue
    }
    // ── 数字状态（数字开头或负号后数字）──
    const isDigit = c >= 48 && c <= 57
    const isNegDigit = c === 45 && sql.charCodeAt(i + 1) >= 48 && sql.charCodeAt(i + 1) <= 57
    if (isDigit || isNegDigit) {
      let j = i + (isNegDigit ? 1 : 0)
      while (j < n && ((sql.charCodeAt(j) >= 48 && sql.charCodeAt(j) <= 57) || sql.charCodeAt(j) === 46)) j++
      tokens.push({ type: 'number', value: sql.slice(i, j) })
      i = j // j > i——严格前进
      continue
    }
    // ── 操作符（最长匹配）──
    const two = sql.slice(i, i + 2)
    const twoOp = two === '>=' || two === '<=' || two === '<>' || two === '!=' || two === '::' ? two : ''
    if (twoOp) { tokens.push({ type: 'op', value: twoOp }); i += 2; continue }
    if (c === 61 || c === 62 || c === 60 || c === 43 || c === 45 || c === 47) {
      tokens.push({ type: 'op', value: sql[i] }); i++; continue
    }
    // ── 标识符状态（字母/_ 开头；含 . 与 _）──
    const isLetter = (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95
    if (isLetter) {
      let j = i
      while (j < n && ((sql.charCodeAt(j) >= 48 && sql.charCodeAt(j) <= 57) || (sql.charCodeAt(j) >= 65 && sql.charCodeAt(j) <= 90) || (sql.charCodeAt(j) >= 97 && sql.charCodeAt(j) <= 122) || sql.charCodeAt(j) === 95 || sql.charCodeAt(j) === 46)) j++
      tokens.push({ type: 'ident', value: sql.slice(i, j) })
      i = j // j > i——严格前进
      continue
    }
    // ── 状态机安全网：任何未处理字符 = 抛错（空消费即抛——死循环不可能）──
    throw new ProtocolError(`memory-sql: 无法解析的字符 '${sql[i]}'（位置 ${i}）`)
  }
  tokens.push({ type: 'eof', value: '' })
  return tokens
}

// ── Parser ────────────────────────────────────────────────

export function parseSqlToAst(sql: string, params: unknown[] = []): Query {
  // DO $$ ... END $$ 匿名块：tokenize 前整体截取——内存仅认块内 CREATE TYPE AS ENUM
  // （平台 schema 幂等 DDL 模式——EXCEPTION duplicate_object 语义 = 已存在跳过）；
  // 其他块内容 doBlock no-op（内存无控制流语义）
  if (/^\s*DO\s+\$\$/i.test(sql.replace(/;$/, '').trim())) {
    const typeMatch = sql.match(/CREATE\s+TYPE\s+(\w+)\s+AS\s+ENUM\s*\(([^)]*)\)/i)
    if (typeMatch) {
      const enumValues = typeMatch[2]
        .split(',')
        .map((v) => v.trim().replace(/^'(.*)'$/, '$1'))
        .filter((v) => v.length > 0)
      return { kind: 'ddl', op: 'createEnum', table: typeMatch[1], enumValues }
    }
    return { kind: 'ddl', op: 'doBlock' }
  }
  const tokens = tokenize(sql.replace(/;$/, '').trim())
  let pos = 0
  // failsafe：步骤计数——任何解析逻辑漏洞超限即抛（死循环物理不可能）
  let steps = 0
  const MAX_STEPS = 1_000_000
  const peek = (): Token => (pos < tokens.length ? tokens[pos] : tokens[tokens.length - 1])
  const peekNext = (): Token => (pos + 1 < tokens.length ? tokens[pos + 1] : tokens[tokens.length - 1])
  const next = (): Token => {
    if (++steps > MAX_STEPS) throw new ProtocolError('memory-sql: 解析器超出最大步骤限制（内部错误）')
    if (pos >= tokens.length) throw new ProtocolError('memory-sql: 解析器 token 越界（输入截断？）')
    return tokens[pos++]
  }
  const expect = (type: TokenType, what: string): Token => {
    const t = next()
    if (t.type !== type) throw new ProtocolError(`memory-sql: 期望 ${what}，得到 '${t.value}'`)
    return t
  }
  const isKeyword = (t: Token, kw: string): boolean => t.type === 'ident' && t.value.toUpperCase() === kw

  // 顶层：SELECT / INSERT / UPDATE / DELETE / CREATE TYPE / DO 块
  const head = next()
  if (head.type !== 'ident') throw new ProtocolError('memory-sql: 语句必须以 SELECT/INSERT/UPDATE/DELETE 开头')

  const kw = head.value.toUpperCase()
  if (kw === 'SELECT') return parseSelect()
  if (kw === 'INSERT') return parseInsert()
  if (kw === 'UPDATE') return parseUpdate()
  if (kw === 'DELETE') return parseDelete()
  if (kw === 'CREATE' || kw === 'DROP' || kw === 'ALTER') return parseDdl(kw)
  throw new ProtocolError(`memory-sql: 不支持的语句 '${head.value}'（仅 SELECT/INSERT/UPDATE/DELETE/CREATE/DROP）`)

  // ── SELECT ──
  function parseSelect(): SelectQuery {
    // 投影（逗号分隔的表达式/列）
    const proj: { expr: string; alias?: string }[] = []
    for (;;) {
      let expr = ''
      let depth = 0
      while (peek().type !== 'comma' && peek().type !== 'eof' && !(depth === 0 && (isKeyword(peek(), 'FROM') || isKeyword(peek(), 'UNION') || isKeyword(peek(), 'WHERE') || isKeyword(peek(), 'ORDER') || isKeyword(peek(), 'LIMIT')))) {
        const t = next()
        if (t.type === 'lparen') depth++
        if (t.type === 'rparen') depth--
        expr = appendToken(expr, t.type === 'string' ? `'${t.value.replace(/'/g, "''")}'` : t.value)
      }
      const parts = expr.trim().split(/\s+AS\s+/i)
      proj.push({ expr: parts[0], alias: parts.length > 1 ? parts[1].trim() : undefined })
      if (peek().type === 'comma') { next(); continue }
      break
    }

    // UNION ALL
    if (isKeyword(peek(), 'UNION')) {
      next()
      expectKeyword('ALL')
      expectKeyword('SELECT')
      const second = parseSelectProjectionRows()
      const first = evalConstProjection(proj, params)
      const secondRow = second
      const firstKeys = Object.keys(first)
      const merged: Record<string, unknown> = {}
      for (let i = 0; i < firstKeys.length; i++) {
        merged[firstKeys[i]] = secondRow[Object.keys(secondRow)[i] ?? firstKeys[i]]
      }
      return { kind: 'select', table: '', cols: [], unionRows: [first, merged] }
    }

    // ── 聚合投影（COUNT [FILTER]/SUM/AVG/MIN/MAX——无 GROUP BY 纯聚合——整表单组）──
    const aggProj = proj.filter((p) => {
      const m = /^(count|sum|avg|min|max)\s*\(/i.exec(p.expr.trim())
      return !!m
    })
    if (aggProj.length === proj.length && aggProj.length > 0) {
      if (!isKeyword(peek(), 'FROM')) {
        // 无 FROM——常量聚合（COUNT(*) 无表）
      } else {
        next() // FROM
      }
      const table = peek().type === 'ident' ? expect('ident', '表名').value : ''
      const alias = peek().type === 'ident' && !['WHERE', 'ORDER', 'LIMIT'].includes(peek().value.toUpperCase()) ? next().value : undefined
      let whereClause: string | undefined
      if (isKeyword(peek(), 'WHERE')) {
        next()
        whereClause = readUntil(['eof'])
      }
      const aggregates = aggProj.map((p) => {
        const m = /^(count|sum|avg|min|max)\s*\(\s*([^)]*)\s*\)(?:\s*FILTER\s*\(\s*WHERE\s+(.+?)\))?(?:\s*::[\w.]+)?(?:\s+AS\s+(\w+))?$/i.exec(p.expr.trim())!
        return {
          fn: m![1].toLowerCase() as 'count',
          col: m![2].trim() || '*',
          as: m![4] ?? p.alias ?? `_agg${aggProj.indexOf(p) + 1}`,
          ...(m![3] ? { filter: parseWhereToExpr(m![3], params, alias) } : {}),
        }
      })
      const q: SelectQuery = { kind: 'select', table, alias, aggregate: aggregates as never }
      if (whereClause) q.where = parseWhereToExpr(whereClause, params, alias)
      return q
    }
    // count(*) 聚合（可带 ::int cast 与 AS 别名——列名 = alias 或 'count'）
    if (proj.length === 1 && /^count\s*\(\s*\*\s*\)\s*(::\w+)?$/i.test(proj[0].expr)) {
      next() // FROM
      const table = expect('ident', '表名').value
      const alias = peek().type === 'ident' && !['WHERE', 'ORDER', 'LIMIT'].includes(peek().value.toUpperCase()) ? next().value : undefined
      let whereClause: string | undefined
      if (isKeyword(peek(), 'WHERE')) {
        next()
        whereClause = readUntil(['ORDER', 'LIMIT', 'eof'])
      }
      const q: SelectQuery = { kind: 'select', table, alias, count: true, cols: [proj[0].alias ?? 'count'] }
      if (whereClause) q.where = parseWhereToExpr(whereClause, params, alias)
      return q
    }
    // FROM
    if (!isKeyword(peek(), 'FROM')) {
      // 无 FROM：常量投影
      return { kind: 'select', table: '', cols: [], unionRows: [evalConstProjection(proj, params)] }
    }
    next() // FROM
    // 派生表 FROM (SELECT ...) alias
    if (peek().type === 'lparen') {
      next()
      let inner = ''
      let depth = 1
      while (depth > 0) {
        const t = next()
        if (t.type === 'eof') throw new ProtocolError('memory-sql: 派生表缺少闭合右括号（FROM (SELECT ...）')
        if (t.type === 'lparen') depth++
        if (t.type === 'rparen') depth--
        if (depth > 0) inner = appendToken(inner, t.type === 'string' ? `'${t.value.replace(/'/g, "''")}'` : t.value)
      }
      const alias = peek().type === 'ident' ? next().value : undefined
      // 外层 WHERE
      let whereClause: string | undefined
      if (isKeyword(peek(), 'WHERE')) {
        next()
        whereClause = readUntil(['ORDER', 'LIMIT', 'eof'])
      }
      return { kind: 'select', table: '', cols: [], derived: { innerSql: inner.trim(), alias, where: whereClause } }
    }
    const table = expect('ident', '表名').value
    const t = peek()
    const alias = t.type === 'ident' && !['WHERE', 'ORDER', 'LIMIT', 'GROUP', 'HAVING'].includes(t.value.toUpperCase()) ? next().value : undefined

    let whereClause: string | undefined
    let orderBy: SelectQuery['orderBy']
    let limit: number | undefined
    const joins: NonNullable<SelectQuery['joins']> = []
    for (;;) {
      // JOIN（LEFT [OUTER] JOIN / INNER JOIN / [plain] JOIN——on 表达式到下一子句）
      if (isKeyword(peek(), 'JOIN') || (isKeyword(peek(), 'LEFT') && isKeyword(peekNext(), 'JOIN')) ||
          (isKeyword(peek(), 'INNER') && isKeyword(peekNext(), 'JOIN'))) {
        let type: 'inner' | 'left' = 'inner'
        if (isKeyword(peek(), 'LEFT')) { next(); type = 'left'; expectKeyword('JOIN') }
        else if (isKeyword(peek(), 'INNER')) { next(); expectKeyword('JOIN') }
        else if (isKeyword(peek(), 'JOIN')) { /* plain */ }
        if (isKeyword(peek(), 'JOIN')) next()
        const rightTable = expect('ident', 'JOIN 表').value
        const rightAlias = peek().type === 'ident' && !['ON', 'WHERE', 'ORDER', 'LIMIT', 'GROUP', 'HAVING'].includes(peek().value.toUpperCase())
          ? next().value : undefined
        expectKeyword('ON')
        const on = readUntil(['WHERE', 'ORDER', 'LIMIT', 'GROUP', 'HAVING', 'JOIN', 'LEFT', 'INNER', 'eof']).trim()
        // ON 保留两侧表前缀（merged 行键=别名.列——剥前缀会丢 join 表侧标识）
        joins.push({ table: rightTable, alias: rightAlias ?? rightTable, type, on: parseWhereToExpr(on, params) })
        continue
      }
      if (isKeyword(peek(), 'WHERE')) { next(); whereClause = readUntil(['ORDER', 'LIMIT', 'eof']); continue }
      if (isKeyword(peek(), 'ORDER')) {
        next(); expectKeyword('BY')
        orderBy = readUntil(['LIMIT', 'eof']).split(',').map((o) => {
          const [c, d] = o.trim().split(/\s+/)
          return { col: stripAlias(c, alias), dir: (d ?? '').toUpperCase() === 'DESC' ? 'desc' as const : 'asc' as const }
        })
        continue
      }
      if (isKeyword(peek(), 'LIMIT')) {
        next()
        const lt = next()
        // 参数化 LIMIT（平台面普遍——LIMIT $n）：数字或参数
        if (lt.type === 'number') limit = Number(lt.value)
        else { limit = Number(evalValue(lt.value, params)) }
        continue
      }
      // 未支持子句（JOIN/GROUP/HAVING/WINDOW 等）——诚实裁剪
      if (peek().type !== 'eof') {
        throw new ProtocolError(`memory-sql: SELECT 子句 '${peek().value}' 不支持（诚实裁剪——JOIN/GROUP BY/HAVING 需真库）`)
      }
      break
    }

    return {
      kind: 'select',
      table,
      alias,
      joins: joins.length ? joins : undefined,
      // '*' = 全列（undefined）；否则投影列
      cols: proj.length === 1 && proj[0].expr === '*' ? undefined : proj.map((p) => {
        if (p.alias) return `${stripAlias(p.expr, alias)} AS ${p.alias}`
        return stripAlias(p.expr, alias)
      }),
      where: whereClause ? parseWhereToExpr(whereClause, params, alias) : undefined,
      orderBy,
      limit,
    }
  }

  function parseSelectProjectionRows(): Record<string, unknown> {
    // UNION 第二段：SELECT expr AS col, ...（无 FROM）
    const proj: { expr: string; alias?: string }[] = []
    for (;;) {
      let expr = ''
      while (peek().type !== 'comma' && peek().type !== 'eof' && !isKeyword(peek(), 'SELECT') && !isKeyword(peek(), 'FROM') && !isKeyword(peek(), 'WHERE')) {
        const t = next()
        expr = appendToken(expr, t.type === 'string' ? `'${t.value.replace(/'/g, "''")}'` : t.value)
      }
      const parts = expr.trim().split(/\s+AS\s+/i)
      proj.push({ expr: parts[0], alias: parts.length > 1 ? parts[1].trim() : undefined })
      if (peek().type === 'comma') { next(); continue }
      break
    }
    return evalConstProjection(proj, params)
  }

  // ── INSERT ──
  function parseInsert(): InsertQuery {
    expectKeyword('INTO')
    const table = expect('ident', '表名').value
    let cols: string[] = []
    if (peek().type === 'lparen') {
      next()
      cols = readUntil(['rparen']).split(',').map((c) => c.trim()).filter(Boolean)
      expect('rparen', ')')
    }
    expectKeyword('VALUES')
    const rows: Record<string, unknown>[] = []
    for (;;) {
      expect('lparen', '(')
      const vals = splitCommas(readUntil(['rparen'])).map((v) => evalValue(v.trim(), params))
      expect('rparen', ')')
      if (!cols.length) cols = vals.map((_, i) => `f${i + 1}`)
      const row: Record<string, unknown> = {}
      cols.forEach((c, i) => { row[c] = vals[i] })
      rows.push(row)
      if (peek().type === 'comma') { next(); continue }
      break
    }
    let onConflict: InsertQuery['onConflict']
    if (isKeyword(peek(), 'ON')) {
      next()
      expectKeyword('CONFLICT')
      let col: string | string[] | undefined
      if (peek().type === 'lparen') {
        next()
        const cols: string[] = []
        for (;;) {
          cols.push(expect('ident', '冲突目标列').value)
          if (peek().type === 'rparen') break
          expect('comma', ',')
        }
        expect('rparen', ')')
        col = cols.length === 1 ? cols[0] : cols
      }
      expectKeyword('DO')
      if (isKeyword(peek(), 'NOTHING')) {
        next()
        onConflict = col ? { col } : {}
      } else if (isKeyword(peek(), 'UPDATE')) {
        next()
        if (!col) throw new ProtocolError('memory-sql: ON CONFLICT DO UPDATE 必须指定冲突目标列（PG 规则——compile 同）')
        expectKeyword('SET')
        // 仅认规范型（compile 生成）：SET c = EXCLUDED.c[, ...]——常量/表达式 SET 判负
        // （D2：表达式 upsert 走真库 SQL 逃生舱——内存诚实裁剪）
        const setClause = readUntil(['RETURNING', 'eof']).trim()
        if (!setClause) throw new ProtocolError('memory-sql: ON CONFLICT DO UPDATE 缺少 SET 子句')
        for (const a of splitCommas(setClause)) {
          const m = /^([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*EXCLUDED\.([A-Za-z_][A-Za-z0-9_.]*)$/i.exec(a.trim())
          if (!m || m[1].toLowerCase() !== m[2].toLowerCase()) {
            throw new ProtocolError(`memory-sql: ON CONFLICT DO UPDATE 仅支持 SET col = EXCLUDED.col（表达式/常量 SET 判负——真库逃生舱）: ${a.trim()}`)
          }
        }
        onConflict = { col, update: true }
      } else {
        throw new ProtocolError(`memory-sql: 期望 DO NOTHING 或 DO UPDATE，得到 '${peek().value}'`)
      }
    }
    let returning: InsertQuery['returning']
    if (isKeyword(peek(), 'RETURNING')) {
      next()
      const r = readUntil(['eof']).trim()
      returning = r === '*' ? '*' : r.split(',').map((c) => c.trim())
    }
    return { kind: 'insert', table, rows, returning, onConflict }
  }

  // ── UPDATE ──
  function parseUpdate(): UpdateQuery {
    const table = expect('ident', '表名').value
    expectKeyword('SET')
    const sets: Record<string, unknown> = {}
    for (;;) {
      const col = expect('ident', '列名').value
      expect('op', '=')
      sets[col] = evalValue(readUntil(['comma', 'WHERE', 'eof']).trim(), params)
      if (peek().type === 'comma') { next(); continue }
      break
    }
    let whereClause: string | undefined
    if (isKeyword(peek(), 'WHERE')) {
      next()
      whereClause = readUntil(['RETURNING', 'eof'])
    }
    const q: UpdateQuery = { kind: 'update', table, sets }
    if (whereClause) q.where = parseWhereToExpr(whereClause, params)
    if (isKeyword(peek(), 'RETURNING')) {
      next()
      const r = readUntil(['eof']).trim()
      q.returning = r === '*' ? '*' : r.split(',').map((c) => c.trim())
    }
    return q
  }

  // ── DELETE ──
  function parseDelete(): DeleteQuery {
    expectKeyword('FROM')
    const table = expect('ident', '表名').value
    let whereClause: string | undefined
    if (isKeyword(peek(), 'WHERE')) {
      next()
      whereClause = readUntil(['RETURNING', 'eof'])
    }
    const q: DeleteQuery = { kind: 'delete', table }
    if (whereClause) q.where = parseWhereToExpr(whereClause, params)
    if (isKeyword(peek(), 'RETURNING')) {
      next()
      const r = readUntil(['eof']).trim()
      q.returning = r === '*' ? '*' : r.split(',').map((c) => c.trim())
    }
    return q
  }

  // ── DDL（CREATE TABLE/DROP TABLE/CREATE INDEX/ALTER——token 流约束解析）──
  function parseDdl(kw: string): DdlQuery {
    if (kw === 'DROP') {
      if (isKeyword(peek(), 'TYPE')) {
        next()
        const ifExists = isKeyword(peek(), 'IF')
        if (ifExists) { next(); expectKeyword('EXISTS') }
        const name = expect('ident', '类型名').value
        if (isKeyword(peek(), 'CASCADE')) next()
        return { kind: 'ddl', op: 'dropEnum', table: name, ifNotExists: ifExists }
      }
      expectKeyword('TABLE')
      const ifExists = isKeyword(peek(), 'IF')
      if (ifExists) { next(); expectKeyword('EXISTS') }
      const table = expect('ident', '表名').value
      return { kind: 'ddl', op: 'dropTable', table, ifNotExists: ifExists }
    }
    if (kw === 'ALTER') {
      // ALTER TYPE x ADD VALUE [IF NOT EXISTS] 'v'——枚举加值（内存：值集合记忆——幂等）
      if (isKeyword(peek(), 'TYPE')) {
        next()
        const name = expect('ident', '类型名').value
        expectKeyword('ADD')
        expectKeyword('VALUE')
        if (isKeyword(peek(), 'IF')) { next(); expectKeyword('NOT'); expectKeyword('EXISTS') }
        const v = expect('string', '枚举值').value
        return { kind: 'ddl', op: 'alterEnumAddValue', table: name, enumValues: [v] }
      }
      // ALTER TABLE x ADD COLUMN [IF NOT EXISTS] c type（增量列——对齐声明式迁移面）
      expectKeyword('TABLE')
      if (isKeyword(peek(), 'IF')) { next(); expectKeyword('EXISTS') }
      const table = expect('ident', '表名').value
      if (isKeyword(peek(), 'ADD')) {
        next()
        if (isKeyword(peek(), 'COLUMN')) next()
        const ifNotExists = isKeyword(peek(), 'IF')
        if (ifNotExists) { next(); expectKeyword('NOT'); expectKeyword('EXISTS') }
        const col = expect('ident', '列名').value
        let type = ''
        while (!['comma', 'rparen'].includes(peek().type) && peek().type !== 'eof' &&
               !isKeyword(peek(), 'NOT') && !isKeyword(peek(), 'DEFAULT') && !isKeyword(peek(), 'REFERENCES')) {
          const t = next()
          type += (type ? ' ' : '') + String(t.value)
        }
        if (isKeyword(peek(), 'NOT')) { next(); expectKeyword('NULL') }
        let defaultVal: unknown
        if (isKeyword(peek(), 'DEFAULT')) {
          next()
          const dv = next()
          if (isKeyword(dv, 'NOW') && peek().value === '(') { next(); next(); defaultVal = undefined }
          else if (isKeyword(dv, 'GEN_RANDOM_UUID')) { next(); next(); defaultVal = undefined }
          else {
            const t = dv.value
            defaultVal = t === 'TRUE' ? true : t === 'FALSE' ? false : /^'.*'$/.test(t) ? t.slice(1, -1).replace(/''/g, "'") : Number.isNaN(Number(t)) ? t : Number(t)
          }
          if (peek().value === '::') { next(); if (peek().type === 'ident') next() }
        }
        return { kind: 'ddl', op: 'alterAddColumn', table, column: col, columnType: type.trim().toUpperCase(), defaultVal }
      }
      return { kind: 'ddl', op: 'alter' }
    }
    // CREATE EXTENSION（pgvector 等——内存吞——无扩展语义）
    if (isKeyword(peek(), 'EXTENSION')) return { kind: 'ddl', op: 'createExtension' }
    // CREATE TYPE name AS ENUM (...)
    if (isKeyword(peek(), 'TYPE')) {
      next()
      const name = expect('ident', '类型名').value
      expectKeyword('AS')
      expectKeyword('ENUM')
      expect('lparen', '(')
      let raw = ''
      let depth = 0
      for (;;) {
        const t = next()
        if (t.type === 'lparen') depth++
        if (t.type === 'rparen') { depth--; if (depth < 0) break }
        if (t.type === 'eof') break
        raw += (t.type === 'string' ? `'${t.value}'` : t.value) + (t.type === 'comma' ? '' : ' ')
      }
      const enumValues = raw.split(',').map((v) => v.trim().replace(/^'|\.'$/g, '')).filter((v) => v.length > 0)
      return { kind: 'ddl', op: 'createEnum', table: name, enumValues }
    }
    // CREATE TABLE | CREATE INDEX | CREATE UNIQUE INDEX
    const isIndex = isKeyword(peek(), 'INDEX') || isKeyword(peek(), 'UNIQUE')
    if (isIndex) return { kind: 'ddl', op: 'createIndex' }
    expectKeyword('TABLE')
    const ifNotExists = isKeyword(peek(), 'IF')
    if (ifNotExists) { next(); expectKeyword('NOT'); expectKeyword('EXISTS') }
    const table = expect('ident', '表名').value
    expect('lparen', '(')
    // 列定义 token 流解析（逗号分隔）——约束提取
    const columns: DdlQuery['columns'] = []
    for (;;) {
      // 表级约束（CHECK/CONSTRAINT/FOREIGN KEY/表级 PRIMARY|UNIQUE (…)）——先于列解析拦截
      // （否则 CONSTRAINT 被当列名吃出噪音——CHECK (type IN ('ai','user'…)) 崩解析）
      if (isKeyword(peek(), 'CHECK') || isKeyword(peek(), 'CONSTRAINT') || isKeyword(peek(), 'FOREIGN')) {
        // peek 先判（break 不预消费终止 token——表级约束后可能直接收表 ））
        let dep = 0
        for (;;) {
          if (dep === 0 && (peek().type === 'comma' || peek().type === 'rparen' || peek().type === 'eof')) break
          const t = next()
          if (t.type === 'lparen') dep++
          if (t.type === 'rparen') dep--
        }
        continue
      }
      // 表级 PRIMARY KEY (a,b) / UNIQUE (a,b)：括号表单先拦截（列内 PRIMARY KEY 无括号——列表尾）
      if ((isKeyword(peek(), 'PRIMARY') || isKeyword(peek(), 'UNIQUE')) && peekNext().type === 'lparen') {
        let dep = 0
        for (;;) {
          if (dep === 0 && (peek().type === 'comma' || peek().type === 'rparen' || peek().type === 'eof')) break
          const t = next()
          if (t.type === 'lparen') dep++
          if (t.type === 'rparen') dep--
        }
        continue
      }
      const col = parseColumnDef()
      if (col) columns.push(col)
      if (peek().type === 'comma') { next(); continue }
      break
    }
    expect('rparen', ')')
    // 尾部（分号/表约束）——忽略
    return { kind: 'ddl', op: 'createTable', table, ifNotExists, columns }
  }

  /** 列定义：name type... [PRIMARY KEY] [UNIQUE] [DEFAULT expr] [NOT NULL] [REFERENCES ...] */
  type ColumnDef = NonNullable<DdlQuery['columns']>[number]
  function parseColumnDef(): ColumnDef | undefined {
    const name = peek()
    // 表级约束（PRIMARY KEY (a,b) / UNIQUE (a)——内存近似：复合键列 0 记 unique）
    // （约束关键字是 ident——必须先于通用列解析拦截——否则被当列名吃出 UNIQUE/dept 噪音）
    if (name.type === 'ident' && (isKeyword(name, 'PRIMARY') || isKeyword(name, 'UNIQUE'))) {
      next()
      if (isKeyword(peek(), 'KEY')) next()
      if (peek().type === 'lparen') {
        next()
        const cols = readUntil(['rparen']).split(',').map((c) => c.trim())
        expect('rparen', ')')
        return {
          name: cols[0],
          type: 'table-constraint',
          pk: false,
          unique: true,
          defaultNow: false,
          defaultUuid: false,
          constraintCols: cols,
        }
      }
      return undefined
    }
    if (name.type !== 'ident') {
      return undefined
    }
    next()
    let type = peek().value ?? ''
    const def: ColumnDef = { name: name.value, type, pk: false, unique: false, defaultNow: false, defaultUuid: false }
    // 类型（token 直到约束关键字/逗号/右括号）
    while (peek().type !== 'comma' && peek().type !== 'rparen' && peek().type !== 'eof') {
      const t = peek()
      if (isKeyword(t, 'PRIMARY') || isKeyword(t, 'UNIQUE') || isKeyword(t, 'NOT') || isKeyword(t, 'DEFAULT') || isKeyword(t, 'REFERENCES')) break
      next()
      type = type === def.type ? t.value : `${type} ${t.value}`
    }
    def.type = type
    // 约束序列
    for (;;) {
      const t = peek()
      if (t.type !== 'ident') break
      const up = t.value.toUpperCase()
      if (up === 'PRIMARY') { next(); expectKeyword('KEY'); def.pk = true; continue }
      if (up === 'UNIQUE') { next(); def.unique = true; continue }
      if (up === 'NOT') { next(); expectKeyword('NULL'); continue }
      if (up === 'DEFAULT') {
        next()
        const dv = next()
        if (isKeyword(dv, 'NOW') && peek().value === '(') { next(); next(); def.defaultNow = true }
        else if (isKeyword(dv, 'GEN_RANDOM_UUID')) { next(); next(); def.defaultUuid = true }
        else { def.defaultVal = parseDefaultLiteral(dv.value) }
        // DEFAULT '[]'::JSONB 类 cast（:: 后类型标识消费——否则残留炸）
        if (peek().value === '::') {
          next()
          if (peek().type === 'ident') next()
        }
        continue
      }
      if (up === 'REFERENCES') { // FK——内存无 FK 语义（忽略到逗号/顶层右括号——括号深度跟踪）
        let depth = 0
        for (;;) {
          const t = peek()
          if (t.type === 'eof') break
          if (depth === 0 && (t.type === 'comma' || t.type === 'rparen')) break
          if (t.type === 'lparen') depth++
          if (t.type === 'rparen') depth--
          next()
        }
        continue
      }
      break
    }
    return def
  }

  // ── 工具 ──
  function expectKeyword(kw: string): void {
    const t = next()
    if (!isKeyword(t, kw)) throw new ProtocolError(`memory-sql: 期望 ${kw}，得到 '${t.value}'`)
  }

  /** 读 token 直到遇到指定关键字/类型（保留终止 token） */
  function readUntil(stops: string[]): string {
    let out = ''
    let depth = 0
    while (peek().type !== 'eof') {
      const t = peek()
      if (t.type === 'lparen') { depth++; next(); out = appendToken(out, t.value); continue }
      if (t.type === 'rparen') {
        if (depth > 0) { depth--; next(); out = appendToken(out, t.value); continue }
        if (stops.includes('rparen')) break
        next(); out = appendToken(out, t.value); continue
      }
      if (t.type === 'ident' && stops.includes(t.value.toUpperCase())) break
      if (t.type === 'comma' && stops.includes('comma')) break
      next()
      const val = t.type === 'string' ? `'${t.value.replace(/'/g, "''")}'` : t.value
      out = appendToken(out, val)
    }
    return out
  }
}

/** WHERE 子句 → Query Language WhereExpr（OR 拆分 → AND 组合 → 条件）
 *  同列多条件走 addWhereCond（对象级合并 / and 包装——不覆盖不静默丢弃） */
export function parseWhereToExpr(clause: string, params: unknown[], alias?: string): WhereExpr {
  // BETWEEN 正规化：col BETWEEN lo AND hi → (col >= lo AND col <= hi)
  // （顶层分割会把 BETWEEN 的 AND 拆散——先替换为括号组——括号 depth 保护）
  const normalized = normalizeBetween(clause)
  // 顶层 OR 拆分（忽略括号）
  const orParts = splitTop(normalized, /\bOR\b/i)
  if (orParts.length > 1) {
    return { or: orParts.map((p) => parseWhereToExpr(p, params, alias)) }
  }
  const andParts = splitTop(normalized, /\bAND\b/i)
  const expr: WhereExpr = {}
  for (const part of andParts) {
    const p = part.trim()
    if (!p) continue
    // IS [NOT] NULL
    const isNull = /^([\w.]+)\s+IS\s+(NOT\s+)?NULL$/i.exec(p)
    if (isNull) {
      addWhereCond(expr, stripAlias(isNull[1], alias), { isNull: !isNull[2] })
      continue
    }
    // IN (v1, v2)
    const inMatch = /^([\w.]+)\s+IN\s*\(([^)]*)\)$/i.exec(p)
    if (inMatch) {
      const list = inMatch[2].split(',').map((v) => evalValue(v.trim(), params))
      addWhereCond(expr, stripAlias(inMatch[1], alias), { in: list } as WhereField)
      continue
    }
    // [I]LIKE（%/_ 模式——matchWhereExpr 全锚定翻译；与 builder 路径对齐）
    const likeMatch = /^([\w.]+)\s+(ILIKE|LIKE)\s+(.+)$/i.exec(p)
    if (likeMatch) {
      const pattern = evalValue(likeMatch[3].trim(), params)
      addWhereCond(expr, stripAlias(likeMatch[1], alias),
        likeMatch[2].toUpperCase() === 'ILIKE' ? { ilike: pattern as string } : { like: pattern as string })
      continue
    }
    // col op value（右侧可能是表达式）
    const cmp = /^([\w.]+)\s*(>=|<=|<>|!=|=|>|<)\s*(.+)$/.exec(p)
    if (cmp) {
      const col = stripAlias(cmp[1], alias)
      const op = cmp[2]
      const raw = cmp[3].trim()
      // 右侧：$n / 字面量 / 列引用 / 表达式
      const v = evalValue(raw, params, true)
      if (v === null) throw new ProtocolError(`memory-sql: WHERE 无法解析 '${p}'（列 = NULL 恒假——规范写法 IS NULL；算子模式显式 { isNull: true }）`)
      if (op === '=') {
        if (typeof v === 'object' && 'col' in (v as object) && (v as RawSql).__raw === undefined) {
          addWhereCond(expr, col, { col: (v as { col: string }).col })
        } else {
          addWhereCond(expr, col, { eq: v } as WhereField)
        }
      } else {
        const opKey: Record<string, string> = { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte', '<>': 'ne', '!=': 'ne' }
        addWhereCond(expr, col, { [opKey[op]]: v } as WhereField)
      }
      continue
    }
    // 括号组（(a = 1)）——逐列路由（同列冲突走合并/and 包装——不覆盖）
    if (p.startsWith('(') && p.endsWith(')')) {
      const inner = parseWhereToExpr(p.slice(1, -1), params, alias)
      for (const [c, f] of Object.entries(inner)) addWhereCond(expr, c, f as WhereField)
      continue
    }
    throw new ProtocolError(`memory-sql: WHERE 无法解析 '${p}'`)
  }
  return expr
}

/** 顶层分割（忽略括号与引号） */
function splitTop(s: string, re: RegExp): string[] {
  const out: string[] = []
  let depth = 0
  let inQuote = false
  let cur = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === "'" && s[i - 1] !== '\\') inQuote = !inQuote
    if (!inQuote) {
      if (ch === '(') depth++
      if (ch === ')') depth--
    }
    if (depth === 0 && !inQuote) {
      const rest = s.slice(i)
      const m = re.exec(rest)
      if (m && m.index === 0) { out.push(cur); cur = ''; i += m[0].length - 1; continue }
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** 常量投影求值（SELECT 1 AS one, 'x' AS name） */
function evalConstProjection(proj: { expr: string; alias?: string }[], params: unknown[]): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const p of proj) {
    const col = p.alias ?? p.expr.trim().split(/\s+/).pop() ?? '?column?'
    row[col] = evalValue(p.expr.trim(), params)
  }
  return row
}

/**
 * 表达式求值：$n 参数 / cast（::type）/ 字面量 / 列引用 / 算术 / now()
 * 返回字面量值；allowColumnRef=true 时裸标识符返回 { col: 'x' }（WHERE 列比较）
 */
function evalValue(raw: string, params: unknown[], allowColumnRef = false): unknown {
  const t = raw.trim()
  // cast 剥离（::type——类型标注，值不变）——含引号字符串 cast；剥离后递归（算术/引号/参数）
  if (t.includes('::')) {
    const castMatch = /^(.*?)::[\w\[\]]+$/.exec(t)
    if (castMatch) return evalValue(castMatch[1], params, allowColumnRef)
  }
  // NOW()（时间戳字面量——VALUES/DEFAULT 面——对齐 memory 当前时刻语义）
  if (/^now\(\)$/i.test(t)) return new Date().toISOString()
  // 引号字符串
  if (t.startsWith("'") && t.endsWith("'") && t.length >= 2) return t.slice(1, -1).replace(/''/g, "'")
  // 参数 $n 或 $n::type
  const param = /^\$(\d+)(?:::\w+)?$/.exec(t)
  if (param) {
    const idx = Number(param[1]) - 1
    if (idx < 0 || idx >= params.length) {
      const err = new ProtocolError(`memory-sql: 参数 $${param[1]} 越界（仅 ${params.length} 个）`)
      ;(err as Error & { code?: string }).code = '08P01'
      throw err
    }
    return params[idx]
  }
  // 数字——超出安全整数范围保留字符串（防静默精度丢失，对齐 int8 语义）
  if (/^-?\d+(\.\d+)?$/.test(t)) {
    if (!t.includes('.') && t.length > 15) {
      const n = Number(t)
      if (!Number.isSafeInteger(n)) return t
    }
    return Number(t)
  }
  // NULL / TRUE / FALSE
  const up = t.toUpperCase()
  if (up === 'NULL') return null
  if (up === 'TRUE') return true
  if (up === 'FALSE') return false
  // 函数：now()
  if (/^now\(\)$/i.test(t)) return new Date().toISOString()
  // DATE_TRUNC('unit', expr) ——月/周/日/小时窗口边界（UTC 语义——对齐 docker PG 默认时区；
  // 平台 3 处：quota 用量窗口·admin overview·stats 月统计——E2 收编）
  const dt = /^date_trunc\s*\(\s*'([a-z]+)'\s*,\s*(.+)\)$/i.exec(t)
  if (dt) {
    const v = evalValue(dt[2], params)
    const d = new Date(String(v))
    if (!Number.isNaN(d.getTime())) {
      const unit = dt[1].toLowerCase()
      const trunc = (ms: number) => new Date(ms).toISOString()
      if (unit === 'month') return trunc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
      if (unit === 'week') { const day = (d.getUTCDay() + 6) % 7; return trunc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)) }
      if (unit === 'day') return trunc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      if (unit === 'hour') return trunc(Math.floor(d.getTime() / 3_600_000) * 3_600_000)
      if (unit === 'minute') return trunc(Math.floor(d.getTime() / 60_000) * 60_000)
    }
  }
  // INTERVAL 'N unit'（时/分/天/秒）→ 毫秒偏移（NOW() - INTERVAL '1 day' 场景）
  const iv = /^INTERVAL\s+'([\d.]+)\s+(day|hour|minute|second|days|hours|minutes|seconds)'$/i.exec(t)
  if (iv) {
    const n = Number(iv[1])
    const unit = iv[2].toLowerCase()
    if (unit.startsWith('day')) return n * 86_400_000
    if (unit.startsWith('hour')) return n * 3_600_000
    if (unit.startsWith('minute')) return n * 60_000
    return n * 1000
  }
  // 括号包裹：剥离递归（(-9007...)::bigint 场景）
  if (t.startsWith('(') && t.endsWith(')')) return evalValue(t.slice(1, -1), params, allowColumnRef)
  // 算术表达式（+-*/——递归求值）
  const arith = /^(.+?)\s*([+\-*/])\s*(.+)$/.exec(t)
  if (arith) {
    const lRaw = evalValue(arith[1], params)
    const rRaw = evalValue(arith[3], params)
    // NOW() - INTERVAL：日期减去毫秒偏移 → 日期时间（保留 Date 语义）
    if (arith[2] === '-' && typeof lRaw === 'string' && typeof rRaw === 'number' && !Number.isNaN(Date.parse(lRaw))) {
      return new Date(Date.parse(lRaw) - rRaw).toISOString()
    }
    const l = Number(lRaw)
    const r = Number(rRaw)
    switch (arith[2]) {
      case '+': return l + r
      case '-': return l - r
      case '*': return l * r
      case '/': return l / r
    }
  }
  // 列引用（WHERE 右侧：u.email = o.user_id）
  if (allowColumnRef && /^[\w.]+$/.test(t)) return { col: t }
  throw new ProtocolError(`memory-sql: 不支持的字面量 '${raw}'（请用 $n 参数或引号字符串）`)
}

/** 字符串感知逗号拆分（VALUES 字面量含逗号——'[0.1,0.2]' 不被切开） */
function splitCommas(s: string): string[] {
  const out: string[] = []
  let buf = ''
  let inStr = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === "'" && s[i + 1] === "'") { buf += c + s[i + 1]; i++; continue }
    if (c === "'") { inStr = !inStr; buf += c; continue }
    if (c === ',' && !inStr) { out.push(buf.trim()); buf = ''; continue }
    buf += c
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** token 拼接：token 间空格（保留 '26 AND role'——不粘连；括号/逗号/操作符紧贴） */
function appendToken(out: string, val: string): string {
  const needSpace =
    out.length > 0 &&
    !out.endsWith(' ') && !out.endsWith('(') &&
    !val.startsWith(')') && !val.startsWith(',') && !val.startsWith('(') &&
    !/^[<>=+\-*/(:]$/.test(out.slice(-1)) && !/^[<>=:]/.test(val)
  return out + (needSpace ? ' ' : '') + val
}

function stripAlias(ref: string, alias?: string): string {
  const dot = ref.indexOf('.')
  // 仅当前缀==别名才剥（d.name 在别名 ag 下必须保留——否则 join 列歧义丢失）
  if (dot >= 0 && alias && ref.slice(0, dot) === alias) return ref.slice(dot + 1)
  return ref
}

/** BETWEEN 正规化：`col BETWEEN lo AND hi` → `(col >= lo AND col <= hi)`（AND 拆分保护） */
function normalizeBetween(clause: string): string {
  let out = clause
  let m: RegExpExecArray | null
  const re = /([\w.]+)\s+BETWEEN\s+(.+?)\s+AND\s+(.+?)(?=\s+(?:AND|OR)\b|$)/gi
  while ((m = re.exec(out)) !== null) {
    const [full, col, lo, hi] = m
    if (!/[()]/.test(lo) && !/[()]/.test(hi)) {
      out = out.slice(0, m.index) + `(${col} >= ${lo} AND ${col} <= ${hi})` + out.slice(m.index + full.length)
      re.lastIndex = m.index + 1
    }
  }
  return out
}

/** DEFAULT 字面量解析（保守面：数字/布尔/NULL/字符串——不碰 JSON/表达式——表达式缺省由库侧承担） */
function parseDefaultLiteral(raw: string): unknown {
  const t = raw.trim()
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'")
  if (t === 'TRUE') return true
  if (t === 'FALSE') return false
  if (t === 'NULL') return null
  const n = Number(t)
  if (!Number.isNaN(n)) return n
  return t
}

