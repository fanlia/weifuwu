/**
 * weifuwu/workflow/expression — 布尔表达式 + 插值（纯函数，零依赖）
 *
 * 语言（v1 定版——多一个运算符 = 一次契约测试）：
 *   expr    := or
 *   or      := and ('||' and)*
 *   and     := unary ('&&' unary)*
 *   unary   := '!' unary | atom
 *   atom    := path ('exists' | ('==' | '!=') (path | literal))? | '(' expr ')' | literal
 *   literal := 'null' | 'true' | 'false' | number | 'str' | "str"
 *   path    := ident ('.' ident | '[' number ']')*
 *
 * 语义定版（写死进测试）：
 *   - 比较用 JS 宽松 ==（'200' == 200 成立——API 抓取场景常见；null == undefined 成立）
 *   - exists = 值 !== undefined（JSON null 存在）
 *   - 裸 path/literal 的布尔语境 = 存在且非空（undefined/null/''/[]/{} → false；0 → true）
 *   - 逻辑运算符产出 boolean（不做 JS 短路返回值语义）
 *   - 无 eval / 无函数调用 / 无算术 —— 安全面：表达式在受信配置中执行
 *
 * ```ts
 * import { compile, evaluateBoolean, interpolate } from './expression.ts'
 * const pred = compile('steps.http.json.data.items exists')
 * evaluateBoolean(pred, ctx)  // → boolean
 * interpolate('{{data.items[0].price}} 元', ctx)  // → 字符串
 * ```
 */

// ── AST ─────────────────────────────────────────────────

export type ExprNode =
  | { kind: 'path'; segments: (string | number)[] }
  | { kind: 'literal'; value: unknown }
  | { kind: 'compare'; left: ExprNode; op: '==' | '!='; right: ExprNode }
  | { kind: 'exists'; target: ExprNode }
  | { kind: 'not'; operand: ExprNode }
  | { kind: 'and'; left: ExprNode; right: ExprNode }
  | { kind: 'or'; left: ExprNode; right: ExprNode }

export type CompiledExpr = (ctx: unknown) => unknown

// ── 词法 ────────────────────────────────────────────────

type Token =
  | { t: 'ident'; v: string; pos: number }
  | { t: 'num'; v: number; pos: number }
  | { t: 'str'; v: string; pos: number }
  | { t: 'op'; v: '==' | '!=' | '&&' | '||' | '!'; pos: number }
  | { t: 'punc'; v: '.' | '[' | ']' | '(' | ')'; pos: number }
  | { t: 'eof'; pos: number }

const IDENT = /[A-Za-z_][A-Za-z0-9_]*/
const NUM = /[0-9]+(?:\.[0-9]+)?/

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
    const two = src.slice(i, i + 2)
    if (two === '==' || two === '!=' || two === '&&' || two === '||') {
      tokens.push({ t: 'op', v: two as '==' | '!=' | '&&' | '||', pos: i })
      i += 2
      continue
    }
    if (ch === '!') { tokens.push({ t: 'op', v: '!', pos: i }); i++; continue }
    if (ch === '.' || ch === '[' || ch === ']' || ch === '(' || ch === ')') {
      tokens.push({ t: 'punc', v: ch as '.' | '[' | ']' | '(' | ')', pos: i })
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
    if (ch === '-' && /[0-9]/.test(src[i + 1] ?? '')) {
      const m = NUM.exec(src.slice(i + 1))
      tokens.push({ t: 'num', v: -Number(m![0]), pos: i })
      i += 1 + m![0].length
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
    const node = this.parseOr()
    const tk = this.peek()
    if (tk.t !== 'eof') this.fail(`expression: unexpected '${tk.v}'`, tk.pos)
    return node
  }
  private parseOr(): ExprNode {
    let left = this.parseAnd()
    while (this.peek().t === 'op' && (this.peek() as any).v === '||') {
      this.next()
      left = { kind: 'or', left, right: this.parseAnd() }
    }
    return left
  }
  private parseAnd(): ExprNode {
    let left = this.parseUnary()
    while (this.peek().t === 'op' && (this.peek() as any).v === '&&') {
      this.next()
      left = { kind: 'and', left, right: this.parseUnary() }
    }
    return left
  }
  private parseUnary(): ExprNode {
    const tk = this.peek()
    if (tk.t === 'op' && tk.v === '!') {
      this.next()
      return { kind: 'not', operand: this.parseUnary() }
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
    if (tk.t === 'num' || tk.t === 'str') {
      this.next()
      return { kind: 'literal', value: tk.t === 'num' ? tk.v : tk.v }
    }
    if (tk.t === 'ident') {
      const kw = tk.v
      if (kw === 'null' || kw === 'true' || kw === 'false') {
        this.next()
        return { kind: 'literal', value: kw === 'null' ? null : kw === 'true' }
      }
      const path = this.parsePath()
      const after = this.peek()
      if (after.t === 'ident' && after.v === 'exists') {
        this.next()
        return { kind: 'exists', target: path }
      }
      if (after.t === 'op' && (after.v === '==' || after.v === '!=')) {
        this.next()
        const rightTk = this.peek()
        if (rightTk.t === 'ident' && (rightTk.v === 'null' || rightTk.v === 'true' || rightTk.v === 'false')) {
          this.next()
          return { kind: 'compare', left: path, op: after.v, right: { kind: 'literal', value: rightTk.v === 'null' ? null : rightTk.v === 'true' } }
        }
        if (rightTk.t === 'num' || rightTk.t === 'str') {
          this.next()
          return { kind: 'compare', left: path, op: after.v, right: { kind: 'literal', value: rightTk.t === 'num' ? rightTk.v : rightTk.v } }
        }
        if (rightTk.t === 'ident') {
          return { kind: 'compare', left: path, op: after.v, right: this.parsePath() }
        }
        this.fail(`expression: expected literal or path after '${after.v}'`, rightTk.pos)
      }
      return path
    }
    this.fail(`expression: unexpected '${tk.t === 'eof' ? '(end)' : String(tk.v)}'`, tk.pos)
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
        const idx = this.next()
        if (idx.t !== 'num' || !Number.isInteger(idx.v)) this.fail(`expression: expected integer index in '[]'`, idx.pos)
        this.expectPunc(']')
        segments.push(idx.v)
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
  let cur: unknown = root
  for (const seg of segments) {
    if (cur === null || cur === undefined) return undefined
    if (typeof seg === 'number') {
      cur = Array.isArray(cur) ? cur[seg] : undefined
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg]
    } else {
      return undefined
    }
  }
  return cur
}

/** 求值（布尔比较/逻辑 → boolean；裸 path → 原值） */
export function evaluate(node: ExprNode, ctx: unknown): unknown {
  switch (node.kind) {
    case 'path': return getPath(ctx, node.segments)
    case 'literal': return node.value
    case 'compare': {
      const l = evaluate(node.left, ctx)
      const r = evaluate(node.right, ctx)
      // 宽松相等（定版语义：'200' == 200；null == undefined——JS ==）
      // eslint-disable-next-line eqeqeq
      return node.op === '==' ? (l == r) : !(l == r)
    }
    case 'exists': return evaluate(node.target, ctx) !== undefined
    case 'not': return !evaluateBoolean(node.operand, ctx)
    case 'and': return evaluateBoolean(node.left, ctx) && evaluateBoolean(node.right, ctx)
    case 'or': return evaluateBoolean(node.left, ctx) || evaluateBoolean(node.right, ctx)
  }
}

/** 布尔语境（when 语义定版）：boolean 直接用；否则"存在且非空"
 *  （undefined/null/''/[]/{} → false；0/false → true；其余 → true） */
/** 布尔语境（when 语义定版）：boolean 直接用；否则"存在且非空"
 *  （undefined/null/''/[]/{} → false；0/false → true；其余 → true） */
export function toBoolean(v: unknown): boolean {
  if (typeof v === 'boolean') return v
  if (v === null || v === undefined) return false
  if (typeof v === 'string') return v.length > 0
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true // number / 其他原始值 = 存在即真（0 是真——"数字存在"语义）
}

export function evaluateBoolean(node: ExprNode, ctx: unknown): boolean {
  return toBoolean(evaluate(node, ctx))
}

/** 编译：parse 一次 → 可复用求值函数 */
export function compile(src: string): CompiledExpr {
  const node = parse(src)
  return (ctx: unknown) => evaluate(node, ctx)
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
export function interpolate(template: string, ctx: unknown): string {
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
    out += stringifyValue(evaluate(parse(src), ctx))
    i = close + 2
  }
  return out
}

/** 测试辅助：AST → 源码字符串（fuzz 对账用——与 parse 形成 round-trip） */
export function toSrc(node: ExprNode): string {
  switch (node.kind) {
    case 'path': return node.segments.reduce<string>((acc, s) => acc + (typeof s === 'number' ? `[${s}]` : (acc === '' ? s : `.${s}`)), '')
    case 'literal': return node.value === null ? 'null' : typeof node.value === 'string' ? `'${node.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : String(node.value)
    case 'compare': return `${toSrc(node.left)} ${node.op} ${toSrc(node.right)}`
    case 'exists': return `${toSrc(node.target)} exists`
    case 'not': return `!${toSrc(node.operand)}`
    case 'and': return `(${toSrc(node.left)} && ${toSrc(node.right)})`
    case 'or': return `(${toSrc(node.left)} || ${toSrc(node.right)})`
  }
}
