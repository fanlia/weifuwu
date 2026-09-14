/**
 * weifuwu 测试面——最小 CSS 解析器（替代 postcss devDependency）
 *
 * 语义面（postcss 兼容子集——契约测试用到的全部）：
 *   parseCss(css) → root 节点
 *   node.type: 'root' | 'rule' | 'atrule' | 'decl'
 *   decl: prop / value / important（+ parent）
 *   rule: selector（+ nodes）· atrule: name / params（+ nodes；无块 atrule 的 nodes 为空）
 *   container.walkDecls(fn) / walkRules(fn) / walkAtRules(name?, fn)
 *
 * 失败语义（对齐 postcss 防线）：未闭合注释/字符串/块 · 顶层冗余 `}` → throw。
 * 注释与字符串内的 `{};:` 不参与切分；值内 `url()`/`calc()` 括号不参与切分。
 */

export class CssNode {
  type: 'root' | 'rule' | 'atrule' | 'decl' = 'root'
  nodes: CssNode[] = []
  parent: CssNode | null = null
  // decl
  prop = ''
  value = ''
  important = false
  // rule
  selector = ''
  // atrule
  name = ''
  params = ''
  /** 块形态（`{...}`）——postcss 以 nodes 有无区分；本解析器显式标记（空块也可判） */
  hasBlock = false

  #walk(match: (n: CssNode) => boolean, fn: (n: CssNode) => void): void {
    for (const n of this.nodes) {
      if (match(n)) fn(n)
      if (n.type !== 'decl') n.#walk(match, fn)
    }
  }

  walkDecls(fn: (d: CssNode) => void): void {
    this.#walk((n) => n.type === 'decl', fn)
  }

  walkRules(fn: (r: CssNode) => void): void {
    this.#walk((n) => n.type === 'rule', fn)
  }

  walkAtRules(name: string | undefined, fn: (r: CssNode) => void): void {
    this.#walk((n) => n.type === 'atrule' && (name === undefined || n.name === name), fn)
  }
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\f'])

/** 从引号位置跳过字符串（含转义），返回结束引号后一位 */
function skipString(css: string, i: number): number {
  const quote = css[i]
  let j = i + 1
  while (j < css.length) {
    if (css[j] === '\\') { j += 2; continue }
    if (css[j] === quote) return j + 1
    j++
  }
  throw new Error(`Unclosed string at ${i}`)
}

/** 文本内首个顶层 `:`（跳过字符串与括号），返回 -1 = 非声明形态 */
function findColon(text: string): number {
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"' || c === "'") { i = skipString(text, i) - 1; continue }
    if (c === '(') { depth++; continue }
    if (c === ')') { depth = Math.max(0, depth - 1); continue }
    if (c === ':' && depth === 0) return i
  }
  return -1
}

/** 解析 atrule 头（`@name params`） */
function setAtRule(node: CssNode, text: string): void {
  const m = text.match(/^@([\w-]+)\s*([\s\S]*)$/)
  if (!m) throw new Error(`Invalid at-rule: ${text.slice(0, 60)}`)
  node.type = 'atrule'
  node.name = m[1].toLowerCase()
  node.params = m[2].trim()
}

/** 解析声明（`prop: value [!important]`） */
function setDecl(node: CssNode, text: string): void {
  const ci = findColon(text)
  if (ci === -1) throw new Error(`Invalid declaration: ${text.slice(0, 60)}`)
  node.type = 'decl'
  node.prop = text.slice(0, ci).trim()
  let v = text.slice(ci + 1).trim()
  const im = v.match(/!\s*important\s*$/i)
  if (im) {
    node.important = true
    v = v.slice(0, im.index).trim()
  }
  node.value = v
}

export function parseCss(css: string): CssNode {
  const root = new CssNode()
  root.type = 'root'
  const stack: CssNode[] = [root]
  const n = css.length
  let i = 0

  while (i < n) {
    // 跳过空白与注释
    for (;;) {
      if (i >= n) break
      const c = css[i]
      if (c === '/' && css[i + 1] === '*') {
        const end = css.indexOf('*/', i + 2)
        if (end === -1) throw new Error('Unclosed comment')
        i = end + 2
        continue
      }
      if (WHITESPACE.has(c)) { i++; continue }
      break
    }
    if (i >= n) break

    if (css[i] === '}') {
      if (stack.length === 1) throw new Error('Unexpected }')
      stack.pop()
      i++
      continue
    }
    if (css[i] === ';') { i++; continue }

    // 扫描一个 chunk：直到顶层 { / ; / } / EOF（字符串/注释/括号免疫）
    const start = i
    let term = 'eof'
    let j = i
    let depth = 0
    while (j < n) {
      const c = css[j]
      if (c === '/' && css[j + 1] === '*') {
        const end = css.indexOf('*/', j + 2)
        if (end === -1) throw new Error('Unclosed comment')
        j = end + 2
        continue
      }
      if (c === '"' || c === "'") { j = skipString(css, j); continue }
      if (c === '(') { depth++; j++; continue }
      if (c === ')') { depth = Math.max(0, depth - 1); j++; continue }
      if (depth === 0 && (c === '{' || c === ';' || c === '}')) { term = c; break }
      j++
    }

    const text = css.slice(start, j).trim()
    const container = stack[stack.length - 1]

    if (term === '{') {
      const node = new CssNode()
      node.parent = container
      if (text.startsWith('@')) setAtRule(node, text)
      else { node.type = 'rule'; node.selector = text }
      node.hasBlock = true
      container.nodes.push(node)
      stack.push(node)
      i = j + 1
      continue
    }

    // term ∈ ';' | '}' | 'eof'
    if (text) {
      const node = new CssNode()
      node.parent = container
      if (text.startsWith('@')) setAtRule(node, text)
      else setDecl(node, text)
      container.nodes.push(node)
    }
    if (term === '}') {
      if (stack.length === 1) throw new Error('Unexpected }')
      stack.pop()
      i = j + 1
    } else if (term === ';') {
      i = j + 1
    } else {
      i = j
    }
  }

  if (stack.length > 1) throw new Error('Unclosed block')
  return root
}
