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
 *   INSERT（多行 VALUES/RETURNING/无列名）
 *   UPDATE / DELETE（SET/WHERE/RETURNING）
 *   表达式：$n 参数/cast（::type）/算术（加减乘除）/now()/引号字符串
 *
 * 诚实裁剪：JOIN/GROUP BY/HAVING/子查询（EXISTS/IN 子查询）/窗口函数——
 *   抛 ProtocolError（真库/Query Language 结构化路径使用）。
 */
import type { Query, SelectQuery, InsertQuery, UpdateQuery, DeleteQuery, WhereExpr, RawSql, DdlQuery } from './query.ts'
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
  const tokens = tokenize(sql.replace(/;$/, '').trim())
  let pos = 0
  // failsafe：步骤计数——任何解析逻辑漏洞超限即抛（死循环物理不可能）
  let steps = 0
  const MAX_STEPS = 1_000_000
  const peek = (): Token => (pos < tokens.length ? tokens[pos] : tokens[tokens.length - 1])
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

  // 顶层：SELECT / INSERT / UPDATE / DELETE
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
    for (;;) {
      if (isKeyword(peek(), 'WHERE')) { next(); whereClause = readUntil(['ORDER', 'LIMIT', 'eof']); continue }
      if (isKeyword(peek(), 'ORDER')) {
        next(); expectKeyword('BY')
        orderBy = readUntil(['LIMIT', 'eof']).split(',').map((o) => {
          const [c, d] = o.trim().split(/\s+/)
          return { col: stripAlias(c, alias), dir: (d ?? '').toUpperCase() === 'DESC' ? 'desc' as const : 'asc' as const }
        })
        continue
      }
      if (isKeyword(peek(), 'LIMIT')) { next(); limit = Number(expect('number', 'LIMIT 值').value); continue }
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
      // '*' = 全列（undefined）；否则投影列
      cols: proj.length === 1 && proj[0].expr === '*' ? undefined : proj.map((p) => p.alias ?? stripAlias(p.expr, alias)),
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
      const vals = readUntil(['rparen']).split(',').map((v) => evalValue(v.trim(), params))
      expect('rparen', ')')
      if (!cols.length) cols = vals.map((_, i) => `f${i + 1}`)
      const row: Record<string, unknown> = {}
      cols.forEach((c, i) => { row[c] = vals[i] })
      rows.push(row)
      if (peek().type === 'comma') { next(); continue }
      break
    }
    let returning: InsertQuery['returning']
    if (isKeyword(peek(), 'RETURNING')) {
      next()
      const r = readUntil(['eof']).trim()
      returning = r === '*' ? '*' : r.split(',').map((c) => c.trim())
    }
    return { kind: 'insert', table, rows, returning }
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
      whereClause = readUntil(['eof'])
    }
    const q: UpdateQuery = { kind: 'update', table, sets }
    if (whereClause) q.where = parseWhereToExpr(whereClause, params)
    return q
  }

  // ── DELETE ──
  function parseDelete(): DeleteQuery {
    expectKeyword('FROM')
    const table = expect('ident', '表名').value
    let whereClause: string | undefined
    if (isKeyword(peek(), 'WHERE')) {
      next()
      whereClause = readUntil(['eof'])
    }
    const q: DeleteQuery = { kind: 'delete', table }
    if (whereClause) q.where = parseWhereToExpr(whereClause, params)
    return q
  }

  // ── DDL（CREATE TABLE/DROP TABLE/CREATE INDEX/ALTER——token 流约束解析）──
  function parseDdl(kw: string): DdlQuery {
    if (kw === 'DROP') {
      expectKeyword('TABLE')
      const ifExists = isKeyword(peek(), 'IF')
      if (ifExists) { next(); expectKeyword('EXISTS') }
      const table = expect('ident', '表名').value
      return { kind: 'ddl', op: 'dropTable', table, ifNotExists: ifExists }
    }
    if (kw === 'ALTER') {
      // ALTER TABLE ...——内存无结构语义（no-op——迁移兼容）
      return { kind: 'ddl', op: 'alter' }
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
    if (name.type !== 'ident') {
      // 表级约束（PRIMARY KEY (a,b) / UNIQUE (a)——内存近似：复合 PK 列记 unique）
      if (isKeyword(name, 'PRIMARY') || isKeyword(name, 'UNIQUE')) {
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
          }
        }
        return undefined
      }
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
        else if (dv.type === 'string') { /* 字面量默认值——忽略 */ }
        else { /* 数字默认值——忽略 */ }
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
    while (peek().type !== 'eof') {
      const t = peek()
      if (t.type === 'ident' && stops.includes(t.value.toUpperCase())) break
      if (t.type === 'rparen' && stops.includes('rparen')) break
      if (t.type === 'comma' && stops.includes('comma')) break
      next()
      const val = t.type === 'string' ? `'${t.value.replace(/'/g, "''")}'` : t.value
      out = appendToken(out, val)
    }
    return out
  }
}

/** WHERE 子句 → Query Language WhereExpr（OR 拆分 → AND 组合 → 条件） */
export function parseWhereToExpr(clause: string, params: unknown[], alias?: string): WhereExpr {
  // 顶层 OR 拆分（忽略括号）
  const orParts = splitTop(clause, /\bOR\b/i)
  if (orParts.length > 1) {
    return { or: orParts.map((p) => parseWhereToExpr(p, params, alias)) }
  }
  const andParts = splitTop(clause, /\bAND\b/i)
  const expr: WhereExpr = {}
  for (const part of andParts) {
    const p = part.trim()
    if (!p) continue
    // IS [NOT] NULL
    const isNull = /^([\w.]+)\s+IS\s+(NOT\s+)?NULL$/i.exec(p)
    if (isNull) {
      expr[stripAlias(isNull[1], alias)] = { isNull: !isNull[2] }
      continue
    }
    // IN (v1, v2)
    const inMatch = /^([\w.]+)\s+IN\s*\(([^)]*)\)$/i.exec(p)
    if (inMatch) {
      const list = inMatch[2].split(',').map((v) => evalValue(v.trim(), params))
      expr[stripAlias(inMatch[1], alias)] = list as never
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
      if (op === '=') {
        // 合并到现有（age > 18 AND age < 65 → { gt, lt }）
        if (v !== null && typeof v === 'object' && 'col' in (v as object) && (v as RawSql).__raw === undefined) {
          expr[col] = { col: (v as { col: string }).col }
        } else {
          const existing = expr[col]
          if (existing && typeof existing === 'object' && !Array.isArray(existing) && !('__raw' in existing)) {
            ;(expr[col] as Record<string, unknown>).eq = v
          } else {
            expr[col] = v as never
          }
        }
      } else {
        const opKey: Record<string, string> = { '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte', '<>': 'ne', '!=': 'ne' }
        const existing = expr[col]
        if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
          ;(existing as Record<string, unknown>)[opKey[op]] = v
        } else {
          expr[col] = { [opKey[op]]: v } as never
        }
      }
      continue
    }
    // 括号组（(a = 1)）
    if (p.startsWith('(') && p.endsWith(')')) {
      const inner = parseWhereToExpr(p.slice(1, -1), params, alias)
      Object.assign(expr, inner)
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
  // 括号包裹：剥离递归（(-9007...)::bigint 场景）
  if (t.startsWith('(') && t.endsWith(')')) return evalValue(t.slice(1, -1), params, allowColumnRef)
  // 算术表达式（+-*/——递归求值）
  const arith = /^(.+?)\s*([+\-*/])\s*(.+)$/.exec(t)
  if (arith) {
    const l = Number(evalValue(arith[1], params))
    const r = Number(evalValue(arith[3], params))
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
  if (dot >= 0 && alias) return ref.slice(dot + 1)
  return ref
}
