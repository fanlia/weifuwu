/**
 * DDL 解析共享模块（E4——单源）——schema.sql / server.ts 运行时 DDL 的 CREATE/ALTER 列集提取。
 * 消费方：test/shapes-alignment.test.ts（逐列对齐契约）· scripts/shape-check.mjs（防回流守卫）。
 * 解析面（引号感知括号配对 + 顶层逗号拆分 + 表级约束跳过）——与 MemoryPostgresServer 同源策略（文本直读）。
 */

/** 引号感知：从括号位置找配对右括号 */
export function matchParen(s: string, open: number): number {
  let depth = 0
  let inStr = false
  for (let i = open; i < s.length; i++) {
    const c = s[i]
    if (c === "'") inStr = !inStr
    if (inStr) continue
    if (c === '(') depth++
    if (c === ')') { depth--; if (depth === 0) return i }
  }
  return -1
}

/** 顶层逗号拆分（括号/字符串感知——注释先剥离防 `--` 内嵌逗号拆散） */
export function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let inStr = false
  let cur = ''
  for (const c of s) {
    if (c === "'") inStr = !inStr
    if (inStr) { cur += c; continue }
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue }
    cur += c
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

export const CONSTRAINT_HEAD = /^(PRIMARY|UNIQUE|CHECK|CONSTRAINT|FOREIGN|EXCLUDE)\b/i

/** 表列定义（含 raw 原文——类型/默认值/约束解析由消费方按需） */
export interface DdlColumn {
  name: string
  /** 列定义原文（去注释——含类型/约束/默认值） */
  raw: string
}

/** 解析单源（CREATE TABLE + ALTER ADD COLUMN）写入 dest（表 → 列定义数组——有序） */
export function collectDefsFrom(src: string, dest: Map<string, DdlColumn[]>, excludeFw: boolean): void {
  const createRe = /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*\(/gi
  let m: RegExpExecArray | null
  while ((m = createRe.exec(src))) {
    const name = m[1]
    const open = src.indexOf('(', m.index)
    const close = matchParen(src, open)
    const inner = src.slice(open + 1, close)
    const cols = dest.get(name) ?? []
    // 注释先剥离再拆分（`-- null=待审批, true=...` 注释内嵌逗号——防拆散）
    for (const def of splitTop(inner.replace(/--[^\n]*/g, ''))) {
      if (CONSTRAINT_HEAD.test(def)) continue // 表级约束——列已单独定义
      const cm = /^([A-Za-z_][A-Za-z0-9_]*)\s/.exec(def.trim())
      if (cm && !cols.some((c) => c.name === cm[1])) cols.push({ name: cm[1], raw: def.trim() })
    }
    dest.set(name, cols)
    createRe.lastIndex = close + 1 // 跳过已消费主体
  }
  const alterRe = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)([^\n;]*)/gi
  while ((m = alterRe.exec(src))) {
    if (excludeFw && m[1].startsWith('_weifuwu_')) continue // 框架表不入
    const cols = dest.get(m[1]) ?? (dest.set(m[1], []).get(m[1]) as DdlColumn[])
    if (!cols.some((c) => c.name === m[2])) cols.push({ name: m[2], raw: (m[2] + (m[3] ?? '')).trim() })
  }
}

/** 双源汇总（schema.sql + server.ts 运行时 DDL——框架表排除）——列定义表 */
export function collectTableDefs(schemaSrc: string, runtimeSrc: string): Map<string, DdlColumn[]> {
  const defs = new Map<string, DdlColumn[]>()
  collectDefsFrom(schemaSrc, defs, false)
  collectDefsFrom(runtimeSrc, defs, true)
  return defs
}

/** 列名面（对齐测试用——从 defs 派生） */
export function collectTables(schemaSrc: string, runtimeSrc: string): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [t, cols] of collectTableDefs(schemaSrc, runtimeSrc)) out.set(t, cols.map((c) => c.name))
  return out
}
