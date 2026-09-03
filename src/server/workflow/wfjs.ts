/**
 * weifuwu/workflow/wfjs — wfjs（受限 JS 子集）→ WorkflowDef 编译器
 *
 * 子集语法（v1 定版——裁剪即编译错，不静默降级）：
 *   语句：    const/let x = 调用|表达式 · x = / += / -= / ++ / -- · if(expr){}else{} ·
 *            while(expr){} · for(const x of expr){} · return expr? · 内置调用语句
 *   表达式：= expression.ts 全语法（JS 语义子集）——无函数调用/无对象/数组字面量
 *   调用：   内置 http/email/ai/template/log/stop——参数为对象字面量（值 = 表达式|模板串|嵌套对象）
 *   模板串： `a${expr}b` → DSL 插值 'a{{expr}}b'（expr 编译期改写）
 *   async/await 关键字接受并忽略（语言全异步）；函数/import/export 为 W8 wave
 *
 * 编译期检查（DSL validate 给不了的静态面）：
 *   - 未声明变量引用 / 给 const 赋值 / 重名声明 / 循环变量遮蔽 → 编译错
 *   - 内置节点名作变量名（http/email/...）→ 编译错
 *   - 裸块 / 链式赋值 / 数组字面量 / 位置参数调用 → 编译错
 *
 * 绑定映射（编译期静态——源码心智与 DSL 一致）：
 *   步骤绑定（const res = await http(...)） → steps.<id>.data.…（data 解包）
 *   set 赋值（const n = 1）                  → vars.<name>.…
 *   for-of 循环变量                          → loop.item / loop.index
 *
 * ```ts
 * import { compileWfjs } from './wfjs.ts'
 * const def = compileWfjs(`
 *   const res = await http({ url: 'https://api.test/items' })
 *   if (res.json.items.length > 0) {
 *     await email({ to: 'ops@x.com', body: \`共 \${res.json.items.length} 条\` })
 *   }
 * `)
 * ```
 */
import { parse as parseExpr, toSrc } from './expression.ts'
import type { WorkflowDef } from './contracts.ts'

// ── 词法 ────────────────────────────────────────────────

type WToken =
  | { t: 'ident'; v: string; pos: number; end: number }
  | { t: 'kw'; v: string; pos: number; end: number }
  | { t: 'num'; v: number; pos: number; end: number }
  | { t: 'str'; v: string; pos: number; end: number }
  | { t: 'template'; raw: string; v: string; pos: number; end: number }
  | { t: 'op'; v: string; pos: number; end: number }
  | { t: 'punc'; v: string; pos: number; end: number }
  | { t: 'eof'; v: string; pos: number; end: number }

const KEYWORDS = new Set(['const', 'let', 'var', 'if', 'else', 'while', 'for', 'of', 'return', 'function', 'import', 'export', 'from', 'as', 'default', 'await', 'async', 'once', 'true', 'false', 'null'])
const PUNCS = new Set(['{', '}', '(', ')', '[', ']', ';', ',', ':', '.'])
const TWO_OPS = new Set(['==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '++', '--'])
const ONE_OPS = new Set(['=', '+', '-', '*', '/', '%', '<', '>', '!'])

function tokenizeWfjs(src: string): WToken[] {
  const tokens: WToken[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue }
    if (ch === '#') { // 行注释
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (ch === '`') { // 模板串（${} 原样保留——表达式部分编译期再解析）
      let j = i + 1
      let raw = ''
      while (j < n && src[j] !== '`') {
        if (src[j] === '\\') { raw += src[j] + (src[j + 1] ?? ''); j += 2; continue }
        raw += src[j]
        j++
      }
      if (j >= n) throw new Error(`wfjs: unterminated template string at ${i}`)
      tokens.push({ t: 'template', raw, v: '', pos: i, end: j + 1 })
      i = j + 1
      continue
    }
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let out = ''
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\') {
          const e = src[j + 1]
          if (e === 'n') { out += '\n'; j += 2; continue }
          if (e === 't') { out += '\t'; j += 2; continue }
          out += e ?? ''
          j += 2
          continue
        }
        out += src[j]
        j++
      }
      if (j >= n) throw new Error(`wfjs: unterminated string at ${i}`)
      tokens.push({ t: 'str', v: out, pos: i, end: j + 1 })
      i = j + 1
      continue
    }
    const two = src.slice(i, i + 2)
    if (TWO_OPS.has(two)) { tokens.push({ t: 'op', v: two, pos: i, end: i + 2 }); i += 2; continue }
    if (ONE_OPS.has(ch)) { tokens.push({ t: 'op', v: ch, pos: i, end: i + 1 }); i++; continue }
    if (PUNCS.has(ch)) { tokens.push({ t: 'punc', v: ch, pos: i, end: i + 1 }); i++; continue }
    if (ch >= '0' && ch <= '9') {
      const m = /[0-9]+(?:\.[0-9]+)?/.exec(src.slice(i))!
      tokens.push({ t: 'num', v: Number(m[0]), pos: i, end: i + m[0].length })
      i += m[0].length
      continue
    }
    const m = /[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i))
    if (m) {
      tokens.push(KEYWORDS.has(m[0]) ? { t: 'kw', v: m[0], pos: i, end: i + m[0].length } : { t: 'ident', v: m[0], pos: i, end: i + m[0].length })
      i += m[0].length
      continue
    }
    throw new Error(`wfjs: unexpected character '${ch}' at ${i} (in ${JSON.stringify(src)})`)
  }
  tokens.push({ t: 'eof', v: '', pos: n, end: n })
  return tokens
}

// ── 语法 AST ────────────────────────────────────────────

type WValue =
  | { t: 'expr'; src: string }
  | { t: 'str'; v: string }
  | { t: 'num'; v: number }
  | { t: 'tpl'; parts: (string | { expr: string })[] }
  | { t: 'obj'; kvs: { key: string; value: WValue }[] }

type WCall = { name: string; args: { key: string | null; value: WValue }[] }

type WStmt =
  | { k: 'var'; name: string; init: WValue | WCall | null; isConst: boolean }
  | { k: 'assign'; target: string; op: '=' | '+=' | '-='; value: string }
  | { k: 'incdec'; target: string; inc: boolean }
  | { k: 'if'; cond: string; then: WStmt[]; else: WStmt[] | null; once: boolean }
  | { k: 'while'; cond: string; body: WStmt[] }
  | { k: 'forof'; varName: string; items: string; body: WStmt[] }
  | { k: 'return'; value: WValue | null }
  | { k: 'call'; call: WCall }

// ── 解析器 ──────────────────────────────────────────────

class WfjsParser {
  private i = 0
  private tokens: WToken[]
  private src: string
  constructor(tokens: WToken[], src: string) {
    this.tokens = tokens
    this.src = src
  }
  private peek(): WToken { return this.tokens[this.i] }
  private next(): WToken { return this.tokens[this.i++] }
  private fail(msg: string, pos: number): never {
    throw new Error(`${msg} at ${pos} (in ${JSON.stringify(this.src)})`)
  }
  private expect(v: string): WToken {
    const tk = this.next()
    if (tk.v !== v) this.fail(`wfjs: expected '${v}'`, tk.pos)
    return tk
  }
  private isPunc(v: string): boolean { const tk = this.peek(); return tk.t === 'punc' && tk.v === v }
  private isKw(v: string): boolean { const tk = this.peek(); return tk.t === 'kw' && tk.v === v }

  parseProgram(): WStmt[] {
    const stmts: WStmt[] = []
    while (this.peek().t !== 'eof') {
      if (this.isPunc(';')) { this.next(); continue }
      stmts.push(this.parseStmt())
      if (this.isPunc(';')) this.next()
    }
    return stmts
  }
  private parseStmt(): WStmt {
    if (this.peek().t === 'kw') {
      const v = (this.peek() as { v: string }).v
      if (v === 'const' || v === 'let' || v === 'var') return this.parseVar()
      if (v === 'if') return this.parseIf()
      if (v === 'while') return this.parseWhile()
      if (v === 'for') return this.parseFor()
      if (v === 'return') return this.parseReturn()
      if (v === 'async') { this.next(); return this.parseStmt() } // 语言全异步——接受并忽略
      if (v === 'await') { this.next(); return this.parseStmt() }
      if (v === 'function' || v === 'import' || v === 'export') {
        this.fail(`wfjs: '${v}' 在后续 wave 支持（W8：函数/import/export）`, (this.peek() as WToken).pos)
      }
    }
    if (this.peek().t === 'ident') return this.parseAssignOrCall()
    this.fail(`wfjs: unexpected '${this.peek().t === 'eof' ? '(end)' : String((this.peek() as WToken).v)}'`, (this.peek() as WToken).pos)
  }
  private parseBlockBody(): WStmt[] {
    const stmts: WStmt[] = []
    while (!this.isPunc('}')) {
      if (this.peek().t === 'eof') this.fail(`wfjs: unclosed block`, (this.peek() as WToken).pos)
      if (this.isPunc(';')) { this.next(); continue }
      stmts.push(this.parseStmt())
      if (this.isPunc(';')) this.next()
    }
    this.next() // }
    return stmts
  }
  private parseVar(): WStmt {
    const kw = this.next()
    const name = this.next()
    if (name.t !== 'ident') this.fail(`wfjs: expected variable name after '${kw.v}'`, name.pos)
    let init: WValue | WCall | null = null
    if (this.peek().t === 'op' && this.peek().v === '=') {
      this.next()
      init = this.parseValueOrCall()
    }
    return { k: 'var', name: name.v, init, isConst: kw.v === 'const' }
  }
  private parseValueOrCall(): WValue | WCall {
    if (this.peek().t === 'kw' && this.peek().v === 'await') this.next() // 语言全异步——接受
    const tk = this.peek()
    const next = this.tokens[this.i + 1]
    // 调用 → ident '('（对象参数）
    if (tk.t === 'ident' && next?.t === 'punc' && next.v === '(') {
      const name = String(this.next().v)
      this.next() // (
      return { name, args: this.parseCallArgs() }
    }
    return this.parseValue()
  }
  private parseCallArgs(): { key: string | null; value: WValue }[] {
    if (this.isPunc(')')) { this.next(); return [] }
    if (this.isPunc('{')) {
      const args = this.parseObjectArgs()
      this.expect(')') // 对象参数后闭合调用括号
      return args
    }
    this.fail(`wfjs: 内置调用需对象参数（{ key: value }）——位置参数仅限 W8 函数调用`, (this.peek() as WToken).pos)
    return []
  }
  private parseObjectArgs(): { key: string | null; value: WValue }[] {
    this.expect('{')
    const args: { key: string | null; value: WValue }[] = []
    while (!this.isPunc('}')) {
      const key = this.next()
      if (key.t !== 'ident' && key.t !== 'str') this.fail(`wfjs: expected argument key in object literal`, key.pos)
      this.expect(':')
      args.push({ key: String(key.v), value: this.parseValue() })
      if (this.isPunc(',')) this.next()
      else break
    }
    this.expect('}')
    return args
  }
  private parseValue(): WValue {
    const tk = this.peek()
    if (tk.t === 'template') { this.next(); return { t: 'tpl', parts: parseTemplateParts(tk.raw) } }
    if (tk.t === 'str') { this.next(); return { t: 'str', v: tk.v } }
    if (tk.t === 'num') { this.next(); return { t: 'num', v: tk.v } }
    if (tk.t === 'kw' && (tk.v === 'true' || tk.v === 'false' || tk.v === 'null')) {
      this.next()
      return { t: 'expr', src: tk.v }
    }
    if (tk.t === 'punc' && tk.v === '{') { // 嵌套对象（headers 等）
      this.next()
      const kvs: { key: string; value: WValue }[] = []
      while (!this.isPunc('}')) {
        const key = this.next()
        if (key.t !== 'ident' && key.t !== 'str') this.fail(`wfjs: expected object key`, key.pos)
        this.expect(':')
        kvs.push({ key: String(key.v), value: this.parseValue() })
        if (this.isPunc(',')) this.next()
        else break
      }
      this.expect('}')
      return { t: 'obj', kvs }
    }
    return { t: 'expr', src: this.scanExpr() }
  }
  /** 扫描表达式源码（单行裁剪：depth0 换行即边界——跨行表达式明确报错） */
  private scanExpr(): string {
    const start = (this.peek() as WToken).pos
    let out = ''
    let depth = 0
    let prevEnd = -1 // 上一 token 原文末端（间隙检查基准——token.end 精确）
    for (;;) {
      const tk = this.peek()
      if (tk.t === 'eof') break
      if (depth === 0) {
        if (tk.t === 'punc' && (tk.v === ',' || tk.v === ';' || tk.v === ')' || tk.v === '}')) break
        if (tk.t === 'op' && (tk.v === '=' || tk.v === '+=' || tk.v === '-=')) break
        // 表达式不跨行：上一 token 末端 → 当前 token 之间的间隙含换行 → 边界
        if (prevEnd >= 0 && this.src.slice(prevEnd, tk.pos).includes('\n')) break
      }
      if (tk.t === 'punc' && (tk.v === '(' || tk.v === '[')) depth++
      if (tk.t === 'punc' && (tk.v === ')' || tk.v === ']')) {
        if (depth === 0) break
        depth--
      }
      out += this.src.slice(tk.pos, tk.end)
      prevEnd = tk.end
      this.next()
    }
    const trimmed = out.trim()
    if (!trimmed) this.fail(`wfjs: expected expression`, start)
    return trimmed
  }
  private parseIf(): WStmt {
    this.expect('if')
    let once = false
    if (this.isKw('once')) { this.next(); once = true }
    this.expect('(')
    const cond = this.scanExpr()
    this.expect(')')
    this.expect('{')
    const then = this.parseBlockBody()
    let elseStmts: WStmt[] | null = null
    if (this.isKw('else')) {
      this.next()
      if (this.isPunc('{')) { this.next(); elseStmts = this.parseBlockBody() }
      else elseStmts = [this.parseStmt()] // else if
    }
    return { k: 'if', cond, then, else: elseStmts, once }
  }
  private parseWhile(): WStmt {
    this.expect('while')
    this.expect('(')
    const cond = this.scanExpr()
    this.expect(')')
    this.expect('{')
    const body = this.parseBlockBody()
    return { k: 'while', cond, body }
  }
  private parseFor(): WStmt {
    this.expect('for')
    this.expect('(')
    const decl = this.next()
    if (decl.t !== 'kw' || !['const', 'let', 'var'].includes(decl.v)) this.fail(`wfjs: for-of 需要 const/let`, decl.pos)
    const name = this.next()
    if (name.t !== 'ident') this.fail(`wfjs: expected loop variable`, name.pos)
    const of = this.next()
    if (of.t !== 'kw' || of.v !== 'of') this.fail(`wfjs: only for...of supported`, of.pos)
    const items = this.scanExpr()
    this.expect(')')
    this.expect('{')
    const body = this.parseBlockBody()
    return { k: 'forof', varName: name.v, items, body }
  }
  private parseReturn(): WStmt {
    this.expect('return')
    if (this.isPunc(';') || this.isPunc('}')) return { k: 'return', value: null }
    return { k: 'return', value: this.parseValue() }
  }
  private parseAssignOrCall(): WStmt {
    const name = this.next()
    if (name.t !== 'ident') this.fail(`wfjs: expected identifier`, name.pos)
    const tk = this.peek()
    if (tk.t === 'punc' && tk.v === '(') {
      this.next()
      return { k: 'call', call: { name: name.v, args: this.parseCallArgs() } }
    }
    if (tk.t === 'op' && ['=', '+=', '-='].includes(tk.v)) {
      const op = tk.v as '=' | '+=' | '-='
      this.next()
      return { k: 'assign', target: name.v, op, value: this.scanExpr() }
    }
    if (tk.t === 'op' && (tk.v === '++' || tk.v === '--')) {
      this.next()
      return { k: 'incdec', target: name.v, inc: tk.v === '++' }
    }
    this.fail(`wfjs: expected assignment or call after '${name.v}'`, tk.pos)
  }
}

/** 模板串 `${...}` → parts（表达式部分原样保留待改写） */
function parseTemplateParts(raw: string): (string | { expr: string })[] {
  const parts: (string | { expr: string })[] = []
  let i = 0
  let lit = ''
  while (i < raw.length) {
    if (raw[i] === '$' && raw[i + 1] === '{') {
      let depth = 1
      let j = i + 2
      let expr = ''
      while (j < raw.length && depth > 0) {
        if (raw[j] === '\\') { expr += raw[j] + (raw[j + 1] ?? ''); j += 2; continue }
        if (raw[j] === '{') depth++
        if (raw[j] === '}') depth--
        if (depth > 0) expr += raw[j]
        j++
      }
      if (depth !== 0) throw new Error(`wfjs: unclosed '\${' in template`)
      if (lit) { parts.push(lit); lit = '' }
      parts.push({ expr: expr.trim() })
      i = j
      continue
    }
    lit += raw[i]
    i++
  }
  if (lit) parts.push(lit)
  return parts
}

// ── 编译（绑定 + 检查 + DSL 生成） ──────────────────────

export type Binding =
  | { kind: 'step'; id: string }
  | { kind: 'var'; name: string }
  | { kind: 'loop' }

const BUILTIN_NAMES = new Set(['http', 'email', 'ai', 'template', 'log', 'stop'])

interface CompileEnv {
  bindings: Map<string, Binding>
  consts: Set<string>
  steps: NonNullable<WorkflowDef['steps']>
}

/** 表达式改写 + 未声明检查：path 首段 ident 必须可解析（绑定表） */
function rewriteExpr(src: string, bindings: Map<string, Binding>, where: string): string {
  const ast = parseExpr(src) // 语法错误 → 编译错
  walkExpr(ast, (path) => {
    const first = path.segments[0]
    if (typeof first !== 'string') return
    const b = bindings.get(first)
    if (!b) throw new Error(`wfjs: 未声明变量 '${first}'（in ${where}: ${src}）`)
    const prefix: (string | number)[] =
      b.kind === 'step' ? ['steps', b.id, 'data']
        : b.kind === 'var' ? ['vars', b.name]
          : ['loop', 'item']
    path.segments = [...prefix, ...path.segments.slice(1)]
  })
  return toSrc(ast)
}

function walkExpr(node: unknown, visit: (p: { segments: (string | number)[] }) => void): void {
  const n = node as Record<string, unknown> | null
  if (!n || typeof n !== 'object') return
  if (n.kind === 'path') visit(n as never)
  for (const key of [['left', 'right'], ['operand']]) {
    for (const k of key) {
      if (n[k] && typeof n[k] === 'object') walkExpr(n[k], visit)
    }
  }
}

function unusedName(env: CompileEnv, base: string): string {
  for (let i = 1; ; i++) {
    const name = `${base}${i}`
    if (!env.bindings.has(name) && !env.steps.some((s) => s.id === name)) return name
  }
}

/** 字段值类型：template（插值文本——url/body/to…）；expr（表达式源码——when/items/value） */
type FieldKind = 'template' | 'expr'

/** 内置步骤字段类型表（与 steps.ts 实现对齐——W6 运行时同表消费） */
const FIELD_KIND: Record<string, Record<string, FieldKind>> = {
  http: { url: 'template', method: 'template', body: 'template', headers: 'template', timeoutMs: 'template' },
  email: { to: 'template', subject: 'template', body: 'template' },
  ai: { prompt: 'template', system: 'template' },
  template: { template: 'template' },
  log: { message: 'template' },
  stop: {},
}

function compileValue(v: WValue, env: CompileEnv, where: string, kind: FieldKind): unknown {
  switch (v.t) {
    case 'str': return kind === 'expr' ? `'${v.v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : v.v
    case 'num': return kind === 'expr' ? String(v.v) : String(v.v)
    case 'expr': return kind === 'template' ? `{{${rewriteExpr(v.src, env.bindings, where)}}}` : rewriteExpr(v.src, env.bindings, where)
    case 'tpl': {
      if (kind === 'expr') throw new Error(`wfjs: 表达式字段不支持模板串（in ${where}）`)
      let out = ''
      for (const p of v.parts) {
        if (typeof p === 'string') out += p
        else out += `{{${rewriteExpr(p.expr, env.bindings, where)}}}`
      }
      return out
    }
    case 'obj': {
      const out: Record<string, unknown> = {}
      for (const kv of v.kvs) out[kv.key] = compileValue(kv.value, env, where, kind)
      return out
    }
  }
}

/** 内置调用参数编译（字段类型表驱动） */
function compileArg(kv: { key: string | null; value: WValue }, type: string, env: CompileEnv): unknown {
  if (kv.key === null) throw new Error(`wfjs: 内置调用需要对象参数`)
  const kind = FIELD_KIND[type]?.[kv.key] ?? 'template'
  return compileValue(kv.value, env, `${type}(${kv.key})`, kind)
}

function childEnv(parent: CompileEnv, steps: NonNullable<WorkflowDef['steps']>): CompileEnv {
  return { bindings: new Map(parent.bindings), consts: new Set(parent.consts), steps }
}

function compileStmt(stmt: WStmt, env: CompileEnv, inLoop: boolean): void {
  const auto = () => unusedName(env, `_${stmt.k}`)
  switch (stmt.k) {
    case 'var': {
      const { name } = stmt
      if (BUILTIN_NAMES.has(name)) throw new Error(`wfjs: 变量名 '${name}' 与内置函数冲突`)
      if (env.bindings.has(name)) throw new Error(`wfjs: 重复声明 '${name}'`)
      if (stmt.init && isCall(stmt.init)) {
        if (!BUILTIN_NAMES.has(stmt.init.name)) {
          throw new Error(`wfjs: 未识别调用 '${stmt.init.name}'（内置：${[...BUILTIN_NAMES].join('/')}；函数调用在 W8 wave）`)
        }
        addBuiltinStep(stmt.init, name, env)
        env.bindings.set(name, { kind: 'step', id: name })
      } else {
        const value = stmt.init ? compileValue(stmt.init as WValue, env, `声明 ${name}`, 'expr') : 'null'
        env.steps.push({ id: name, type: 'set', config: { name, value } })
        env.bindings.set(name, { kind: 'var', name })
      }
      if (stmt.isConst) env.consts.add(name)
      return
    }
    case 'assign': {
      if (env.consts.has(stmt.target)) throw new Error(`wfjs: 不能给 const '${stmt.target}' 赋值`)
      if (!env.bindings.has(stmt.target)) throw new Error(`wfjs: 未声明变量 '${stmt.target}'`)
      const rhs = rewriteExpr(stmt.value, env.bindings, `赋值 ${stmt.target}`)
      const value = stmt.op === '=' ? rhs : `(vars.${stmt.target} ${stmt.op[0]} ${rhs})`
      env.steps.push({ id: auto(), type: 'set', config: { name: stmt.target, value } })
      return
    }
    case 'incdec': {
      if (env.consts.has(stmt.target)) throw new Error(`wfjs: 不能给 const '${stmt.target}' 赋值`)
      if (!env.bindings.has(stmt.target)) throw new Error(`wfjs: 未声明变量 '${stmt.target}'`)
      env.steps.push({
        id: auto(), type: 'set',
        config: { name: stmt.target, value: `(vars.${stmt.target} ${stmt.inc ? '+' : '-'} 1)` },
      })
      return
    }
    case 'if': {
      const when = rewriteExpr(stmt.cond, env.bindings, 'if 条件')
      const then: NonNullable<WorkflowDef['steps']> = []
      compileInto(stmt.then, childEnv(env, then), inLoop)
      const config: Record<string, unknown> = { when }
      if (stmt.once) config.edge = true
      if (then.length) config.then = { steps: then }
      if (stmt.else) {
        const elseSteps: NonNullable<WorkflowDef['steps']> = []
        compileInto(stmt.else, childEnv(env, elseSteps), inLoop)
        if (elseSteps.length) config.else = { steps: elseSteps }
      }
      env.steps.push({ id: auto(), type: 'if', config })
      return
    }
    case 'while': {
      const when = rewriteExpr(stmt.cond, env.bindings, 'while 条件')
      const body: NonNullable<WorkflowDef['steps']> = []
      compileInto(stmt.body, childEnv(env, body), true)
      env.steps.push({ id: auto(), type: 'while', config: { when, step: { steps: body } } })
      return
    }
    case 'forof': {
      if (env.bindings.has(stmt.varName)) throw new Error(`wfjs: 循环变量 '${stmt.varName}' 与上层声明冲突（暂不支持遮蔽）`)
      const items = rewriteExpr(stmt.items, env.bindings, 'for-of')
      const child = childEnv(env, [])
      child.bindings.set(stmt.varName, { kind: 'loop' })
      const body: NonNullable<WorkflowDef['steps']> = []
      compileInto(stmt.body, childEnv(child, body), true)
      env.steps.push({ id: auto(), type: 'forEach', config: { items, step: { steps: body } } })
      return
    }
    case 'return': {
      const value = stmt.value ? compileValue(stmt.value, env, 'return', 'expr') : undefined
      env.steps.push({ id: auto(), type: 'return', config: value !== undefined ? { value: value as never } : {} })
      return
    }
    case 'call': {
      addBuiltinStep(stmt.call, null, env)
      return
    }
  }
}

function isCall(v: WValue | WCall): v is WCall {
  return typeof (v as WCall).name === 'string' && Array.isArray((v as WCall).args)
}

function compileInto(stmts: WStmt[], env: CompileEnv, inLoop: boolean): void {
  for (const s of stmts) compileStmt(s, env, inLoop)
}

/** 内置调用 → 步骤（绑定名 = 步骤 id；空绑定 → auto id） */
function addBuiltinStep(call: WCall, bindId: string | null, env: CompileEnv): void {
  if (!BUILTIN_NAMES.has(call.name)) {
    throw new Error(`wfjs: 未识别调用 '${call.name}'（内置：${[...BUILTIN_NAMES].join('/')}；函数调用在 W8 wave）`)
  }
  const id = bindId ?? unusedName(env, `_${call.name}`)
  const config: Record<string, unknown> = {}
  for (const arg of call.args) {
    config[arg.key as string] = compileArg(arg, call.name, env)
  }
  env.steps.push({ id, type: call.name, config })
}

/**
 * wfjs 源码 → WorkflowDef（编译错抛错；产物再经 validate 结构校验）
 */
export function compileWfjs(src: string): WorkflowDef {
  const parser = new WfjsParser(tokenizeWfjs(src), src)
  const stmts = parser.parseProgram()
  const env: CompileEnv = { bindings: new Map(), consts: new Set(), steps: [] }
  compileInto(stmts, env, false)
  return { steps: env.steps }
}

/** 测试导出：表达式改写（绑定映射单测） */
export function _rewriteExprForTest(src: string, bindings: Map<string, Binding>): string {
  return rewriteExpr(src, bindings, 'test')
}
