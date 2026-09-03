/**
 * weifuwu/workflow/expression — JS 表达式子集（纯函数，零依赖）
 *
 * 语言（v1 定版——多一个运算符 = 一次契约测试）：
 *   expr    := or
 *   or      := and ('||' and)*
 *   and     := cmp ('&&' cmp)*
 *   cmp     := arith (('==' | '!=' | '<' | '<=' | '>' | '>=') arith)?
 *   arith   := term (('+' | '-') term)*
 *   term    := unary (('*' | '/' | '%') unary)*
 *   unary   := ('!' | '-') unary | atom
 *   atom    := path | literal | '(' expr ')'
 *   literal := 'null' | 'true' | 'false' | number | 'str' | "str"
 *   path    := ident ('.' ident | '[' number ']' | '[*]')*
 *
 * 语义定版（**= JS 表达式子集**——逐条 JS，仅两处安全偏差文档化）：
 *   - 比较用 JS 宽松 ==（'200' == 200 成立）；布尔语境 = JS truthy（[] → true；0 → false）
 *   - 逻辑运算符返回操作数（JS 语义：a || 'default' 默认值模式）
 *   - **偏差①（防呆）**：算术严格数字——非 number 操作数抛错（JS 的 '1'+1='11' 是著名坑；拼接走模板字段）
 *   - **偏差②（防呆）**：非有限结果抛错（JS 除零返回 Infinity/NaN）
 *   - '.' 段名 'length'：数组/字符串 → 长度；'[*]' 投影：数组 → 逐元素求值 + flat(1)
 *   - 无 eval / 无函数调用 —— 安全面：表达式在受信配置中执行
 *
 * ```ts
 * import { compile, toBoolean, interpolate } from './expression.ts'
 * const pred = compile('vars.count < 10 && res.json.items.length > 0')
 * toBoolean(pred(ctx))      // → boolean（JS truthy）
 * interpolate('共 {{items.length}} 个', ctx)  // → 字符串
 * ```
 */

// ── AST ─────────────────────────────────────────────────

export type ExprNode =
  | { kind: 'path'; segments: (string | number)[] }
  | { kind: 'literal'; value: unknown }
  | { kind: 'compare'; op: '==' | '!=' | '===' | '!==' | '<' | '<=' | '>' | '>='; left: ExprNode; right: ExprNode }
  | { kind: 'arith'; op: '+' | '-' | '*' | '/' | '%'; left: ExprNode; right: ExprNode }
  | { kind: 'ternary'; cond: ExprNode; then: ExprNode; else: ExprNode }
  | { kind: 'call'; name: string; args: ExprNode[] }
  | { kind: 'neg'; operand: ExprNode }
  | { kind: 'not'; operand: ExprNode }
  | { kind: 'and'; left: ExprNode; right: ExprNode }
  | { kind: 'or'; left: ExprNode; right: ExprNode }

/** 纯函数环境（表达式内调用——std/用户函数；副作用函数（http/email）禁止） */
export type ExprFns = Record<string, (args: unknown[]) => unknown>

export type CompiledExpr = (ctx: unknown) => unknown

// ── 词法 ────────────────────────────────────────────────

type Token =
  | { t: 'ident'; v: string; pos: number }
  | { t: 'num'; v: number; pos: number }
  | { t: 'str'; v: string; pos: number }
  | { t: 'op'; v: string; pos: number }
  | { t: 'punc'; v: '.' | '[' | ']' | '(' | ')' | ',' | ':'; pos: number }
  | { t: 'eof'; pos: number }

const IDENT = /[A-Za-z_$][A-Za-z0-9_$]*/
const NUM = /[0-9]+(?:\.[0-9]+)?/

const THREE_CHAR_OPS = ['===', '!==']
const TWO_CHAR_OPS = ['==', '!=', '&&', '||', '<=', '>=']
const ONE_CHAR_OPS = ['!', '+', '-', '*', '/', '%', '<', '>', '?']

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue }
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let out = ''
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\') {
          const esc = src[j + 1]
          if (esc === '\\' || esc === quote) { out += esc; j += 2; continue }
          if (esc === 'n') { out += '\n'; j += 2; continue }
          if (esc === 't') { out += '\t'; j += 2; continue }
          throw new Error(`expression: invalid escape '\\${esc ?? ''}' at ${j} (in ${JSON.stringify(src)})`)
        }
        out += src[j]
        j++
      }
      if (j >= n) throw new Error(`expression: unterminated string (in ${JSON.stringify(src)})`)
      tokens.push({ t: 'str', v: out, pos: i })
      i = j + 1
      continue
    }
    const three = src.slice(i, i + 3)
    if (THREE_CHAR_OPS.includes(three)) {
      tokens.push({ t: 'op', v: three, pos: i })
      i += 3
      continue
    }
    const two = src.slice(i, i + 2)
    if (TWO_CHAR_OPS.includes(two)) {
      tokens.push({ t: 'op', v: two, pos: i })
      i += 2
      continue
    }
    if (ONE_CHAR_OPS.includes(ch)) {
      tokens.push({ t: 'op', v: ch, pos: i })
      i++
      continue
    }
    if (ch === '.' || ch === '[' || ch === ']' || ch === '(' || ch === ')' || ch === ',' || ch === ':') {
      tokens.push({ t: 'punc', v: ch as '.' | '[' | ']' | '(' | ')' | ',' | ':', pos: i })
      i++
      continue
    }
    if (ch >= '0' && ch <= '9') {
      const m = NUM.exec(src.slice(i))
      if (!m) throw new Error(`expression: invalid number at ${i} (in ${JSON.stringify(src)})`)
      tokens.push({ t: 'num', v: Number(m[0]), pos: i })
      i += m[0].length
      continue
    }
    const m = IDENT.exec(src.slice(i))
    if (m) {
      tokens.push({ t: 'ident', v: m[0], pos: i })
      i += m[0].length
      continue
    }
    throw new Error(`expression: unexpected character '${ch}' at ${i} (in ${JSON.stringify(src)})`)
  }
  tokens.push({ t: 'eof', pos: n })
  return tokens
}

// ── 解析（递归下降） ────────────────────────────────────

class Parser {
  private i = 0
  private tokens: Token[]
  private src: string
  constructor(tokens: Token[], src: string) {
    this.tokens = tokens
    this.src = src
  }
  private peek(): Token { return this.tokens[this.i] }
  private next(): Token { return this.tokens[this.i++] }
  private fail(msg: string, pos: number): never {
    throw new Error(`${msg} at ${pos} (in ${JSON.stringify(this.src)})`)
  }
  private expectPunc(v: string): void {
    const tk = this.next()
    if (tk.t !== 'punc' || tk.v !== v) this.fail(`expression: expected '${v}'`, tk.pos)
  }
  parse(): ExprNode {
    const node = this.parseTernary()
    const tk = this.peek()
    if (tk.t !== 'eof') this.fail(`expression: unexpected '${String(tk.v)}'`, tk.pos)
    return node
  }
  /** 三元（最低优先级）：cond ? then : else */
  private parseTernary(): ExprNode {
    const cond = this.parseOr()
    const tk = this.peek()
    if (tk.t === 'op' && tk.v === '?') {
      this.next()
      const then = this.parseTernary()
      const col = this.next()
      if (col.t !== 'punc' || col.v !== ':') this.fail(`expression: expected ':' in ternary`, col.pos)
      const else_ = this.parseTernary()
      return { kind: 'ternary', cond, then, else: else_ }
    }
    return cond
  }
  private parseOr(): ExprNode {
    let left = this.parseAnd()
    while (this.isOp('||')) {
      this.next()
      left = { kind: 'or', left, right: this.parseAnd() }
    }
    return left
  }
  private parseAnd(): ExprNode {
    let left = this.parseCmp()
    while (this.isOp('&&')) {
      this.next()
      left = { kind: 'and', left, right: this.parseCmp() }
    }
    return left
  }
  private parseCmp(): ExprNode {
    const left = this.parseArith()
    const tk = this.peek()
    if (tk.t === 'op' && ['==', '!=', '===', '!==', '<', '<=', '>', '>='].includes(tk.v)) {
      this.next()
      return { kind: 'compare', op: tk.v as '==' | '!=' | '===' | '!==' | '<' | '<=' | '>' | '>=', left, right: this.parseArith() }
    }
    return left
  }
  private parseArith(): ExprNode {
    let left = this.parseTerm()
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.next() as any).v as '+' | '-'
      left = { kind: 'arith', op, left, right: this.parseTerm() }
    }
    return left
  }
  private parseTerm(): ExprNode {
    let left = this.parseUnary()
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = (this.next() as any).v as '*' | '/' | '%'
      left = { kind: 'arith', op, left, right: this.parseUnary() }
    }
    return left
  }
  private isOp(v: string): boolean {
    const tk = this.peek()
    return tk.t === 'op' && tk.v === v
  }
  private parseUnary(): ExprNode {
    const tk = this.peek()
    if (tk.t === 'op' && tk.v === '!') {
      this.next()
      return { kind: 'not', operand: this.parseUnary() }
    }
    if (tk.t === 'op' && tk.v === '-') {
      this.next()
      return { kind: 'neg', operand: this.parseUnary() }
    }
    return this.parseAtom()
  }
  private parseAtom(): ExprNode {
    const tk = this.peek()
    if (tk.t === 'punc' && tk.v === '(') {
      this.next()
      const inner = this.parseOr()
      this.expectPunc(')')
      return inner
    }
    if (tk.t === 'num') {
      this.next()
      return { kind: 'literal', value: tk.v }
    }
    if (tk.t === 'str') {
      this.next()
      return { kind: 'literal', value: tk.v }
    }
    if (tk.t === 'ident') {
      const kw = tk.v
      if (kw === 'null' || kw === 'true' || kw === 'false') {
        this.next()
        return { kind: 'literal', value: kw === 'null' ? null : kw === 'true' }
      }
      const path = this.parsePath()
      const after = this.peek()
      // 表达式内函数调用（纯函数——std/用户函数）：ident '(' args ')'
      if (path.kind === 'path' && after.t === 'punc' && after.v === '(') {
        this.next()
        const args: ExprNode[] = []
        if (!this.isPunc2(')')) {
          for (;;) {
            args.push(this.parseTernary())
            if (this.isPunc2(',')) { this.next(); continue }
            break
          }
        }
        this.expectPunc(')')
        return { kind: 'call', name: path.segments[0] as string, args }
      }
      return path
    }
    this.fail(`expression: unexpected '${tk.t === 'eof' ? '(end)' : String(tk.v)}'`, tk.pos)
  }
  private isPunc2(v: string): boolean {
    const tk = this.peek()
    return tk.t === 'punc' && tk.v === v
  }
  private parsePath(): ExprNode {
    const segments: (string | number)[] = []
    const first = this.next()
    if (first.t !== 'ident') this.fail(`expression: expected path`, first.pos)
    segments.push(first.v)
    for (;;) {
      const tk = this.peek()
      if (tk.t === 'punc' && tk.v === '.') {
        this.next()
        const seg = this.next()
        if (seg.t !== 'ident') this.fail(`expression: expected property after '.'`, seg.pos)
        segments.push(seg.v)
        continue
      }
      if (tk.t === 'punc' && tk.v === '[') {
        this.next()
        const inner = this.next()
        if (inner.t === 'op' && inner.v === '*') {
          this.expectPunc(']')
          segments.push('*')
          continue
        }
        if (inner.t !== 'num' || !Number.isInteger(inner.v)) this.fail(`expression: expected integer index or '*' in '[]'`, inner.pos)
        this.expectPunc(']')
        segments.push(inner.v)
        continue
      }
      break
    }
    return { kind: 'path', segments }
  }
}

/** 解析表达式 → AST（语法错误抛错，带位置） */
export function parse(src: string): ExprNode {
  return new Parser(tokenize(src), src).parse()
}

// ── 求值 ────────────────────────────────────────────────

function getPath(root: unknown, segments: (string | number)[]): unknown {
  // '[*]'：投影当前数组 → 逐元素继续剩余段 + flat(1)（嵌套投影展平）
  function rest(cur: unknown, i: number): unknown {
    const seg = segments[i]
    if (seg === undefined) return cur // 路径尽——null 是合法末值（exists 语义：null 存在）
    if (cur === null || cur === undefined) return undefined // 中途缺失
    if (seg === '*') {
      if (!Array.isArray(cur)) return []
      const out: unknown[] = []
      for (const el of cur) {
        const v = rest(el, i + 1)
        if (Array.isArray(v)) out.push(...v)
        else if (v !== undefined) out.push(v)
      }
      return out
    }
    let next: unknown
    if (typeof seg === 'number') {
      next = Array.isArray(cur) ? cur[seg] : undefined
    } else if (seg === 'length') {
      if (Array.isArray(cur)) next = cur.length
      else if (typeof cur === 'string') next = cur.length
      else if (typeof cur === 'object') next = (cur as Record<string, unknown>)[seg]
      else next = undefined
    } else if (typeof cur === 'object') {
      next = (cur as Record<string, unknown>)[seg]
    } else {
      next = undefined
    }
    return rest(next, i + 1)
  }
  return rest(root, 0)
}

/** 算术严格数字：非 number 操作数 → 抛错（不静默字符串拼接）；非有限结果 → 抛错（除零防呆） */
function arith(op: '+' | '-' | '*' | '/' | '%', l: unknown, r: unknown): number {
  if (typeof l !== 'number' || typeof r !== 'number') {
    throw new Error(`expression: arithmetic '${op}' requires numbers (got ${typeName(l)} ${op} ${typeName(r)})`)
  }
  let out: number
  switch (op) {
    case '+': out = l + r; break
    case '-': out = l - r; break
    case '*': out = l * r; break
    case '/': out = l / r; break
    case '%': out = l % r; break
  }
  if (!Number.isFinite(out)) throw new Error(`expression: arithmetic '${op}' produced non-finite result`)
  return out
}

function typeName(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

import { STD_NAMES } from './std.ts'

/** 求值（比较/算术/逻辑 → number/boolean；调用 → 纯函数环境；裸 path → 原值） */
export function evaluate(node: ExprNode, ctx: unknown, fns?: ExprFns): unknown {
  switch (node.kind) {
    case 'path': return getPath(ctx, node.segments)
    case 'literal': return node.value
    case 'neg': {
      const v = evaluate(node.operand, ctx, fns)
      if (typeof v !== 'number') throw new Error(`expression: unary '-' requires number (got ${typeName(v)})`)
      return -v
    }
    case 'arith': return arith(node.op, evaluate(node.left, ctx, fns), evaluate(node.right, ctx, fns))
    case 'ternary': return evaluateBoolean(node.cond, ctx, fns) ? evaluate(node.then, ctx, fns) : evaluate(node.else, ctx, fns)
    case 'call': {
      if (!fns?.[node.name]) throw new Error(`expression: 未注册函数 '${node.name}'（std 纯函数：${STD_NAMES.join('/')}）`)
      return fns[node.name](node.args.map((a) => evaluate(a, ctx, fns)))
    }
    case 'compare': {
      const l = evaluate(node.left, ctx, fns)
      const r = evaluate(node.right, ctx, fns)
      switch (node.op) {
        // 宽松相等（JS 语义）
        // eslint-disable-next-line eqeqeq
        case '==': return l == r
        // eslint-disable-next-line eqeqeq
        case '!=': return !(l == r)
        // 严格相等（JS === 语义——不类型转换）
        case '===': return l === r
        case '!==': return l !== r
        case '<': return (l as any) < (r as any)
        case '<=': return (l as any) <= (r as any)
        case '>': return (l as any) > (r as any)
        case '>=': return (l as any) >= (r as any)
      }
    }
    case 'not': return !toBoolean(evaluate(node.operand, ctx, fns))
    // JS 语义：返回操作数（非 boolean 包装）
    case 'and': { const l = evaluate(node.left, ctx, fns); return toBoolean(l) ? evaluate(node.right, ctx, fns) : l }
    case 'or': { const l = evaluate(node.left, ctx, fns); return toBoolean(l) ? l : evaluate(node.right, ctx, fns) }
  }
}

/** 布尔语境 = JS truthy（Boolean()——与 JS 逐条一致） */
export function toBoolean(v: unknown): boolean {
  return Boolean(v)
}

export function evaluateBoolean(node: ExprNode, ctx: unknown, fns?: ExprFns): boolean {
  return toBoolean(evaluate(node, ctx, fns))
}

/** 编译：parse 一次 → 可复用求值函数 */
export function compile(src: string, fns?: ExprFns): CompiledExpr {
  const node = parse(src)
  return (ctx: unknown) => evaluate(node, ctx, fns)
}



// ── 插值 ────────────────────────────────────────────────

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/**
 * 字符串插值：`{{expr}}` 逐段求值字符串化（缺失 → ''；对象 → JSON.stringify）
 * `{{` 无闭合 `}}` 或空表达式 → 抛错（配置错误不静默）
 */
export function interpolate(template: string, ctx: unknown, fns?: ExprFns): string {
  if (!template.includes('{{')) return template
  let out = ''
  let i = 0
  for (;;) {
    const open = template.indexOf('{{', i)
    if (open === -1) { out += template.slice(i); break }
    const close = template.indexOf('}}', open + 2)
    if (close === -1) {
      throw new Error(`workflow/expression: interpolate: unclosed '{{' at ${open} (in ${JSON.stringify(template)})`)
    }
    const src = template.slice(open + 2, close).trim()
    if (!src) throw new Error(`workflow/expression: interpolate: empty expression (in ${JSON.stringify(template)})`)
    out += template.slice(i, open)
    out += stringifyValue(evaluate(parse(src), ctx, fns))
    i = close + 2
  }
  return out
}

/** 测试辅助：AST → 源码字符串（fuzz 对账用——与 parse 形成 round-trip） */
export function toSrc(node: ExprNode): string {
  switch (node.kind) {
    case 'path': return node.segments.reduce<string>((acc, s) => acc + (typeof s === 'number' ? `[${s}]` : s === '*' ? '[*]' : (acc === '' ? s : `.${s}`)), '')
    case 'literal': return node.value === null ? 'null' : typeof node.value === 'string' ? `'${node.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(node.value)
    case 'ternary': return `(${toSrc(node.cond)} ? ${toSrc(node.then)} : ${toSrc(node.else)})`
    case 'call': return `${node.name}(${node.args.map((a) => toSrc(a)).join(', ')})`
    case 'neg': return `-${toSrc(node.operand)}`
    case 'arith': return `(${toSrc(node.left)} ${node.op} ${toSrc(node.right)})`
    case 'compare': return `(${toSrc(node.left)} ${node.op} ${toSrc(node.right)})`
    case 'not': return `!${toSrc(node.operand)}`
    case 'and': return `(${toSrc(node.left)} && ${toSrc(node.right)})`
    case 'or': return `(${toSrc(node.left)} || ${toSrc(node.right)})`
  }
}
