#!/usr/bin/env node
/**
 * weifuwu core 审计（ P5——R7）
 *
 * 规则（防御性 return 标注 + as any 登记制——防回潮）：
 *   C1  proc* 处理器裸 return 必须有语义标注（防御/审计/幂等/合法/违例/
 *      静默/兜底/Reject/回退/断言——上方注释窗口 8 行内）——无标注 = 静默
 *      吞错路径（P2 条款——显式化）
 *   C2  core `as any` 登记制——已知豁免模式（debug 门/动态属性——TS 面
 *      不足）白名单外出现 = 报错（新增必须登记理由）
 *
 * 用法：node scripts/core-audit.mjs          # 摘要（违规 → 退出码 1）
 *       node scripts/core-audit.mjs --json
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CORE_DIR = join(root, 'src/client/vdom/core')

/** C1 标注词（防御性 return 的语义显式化清单） */
const ANNOTATION_RE = /防御|审计|幂等|合法|违例|静默|兜底|Reject|回退|断言|规范/

/** C2 as any 豁免登记（模式 → 理由——新增必须登记） */
const AS_ANY_EXEMPTIONS = [
  { pattern: 'globalThis as any).__', reason: 'debug 门控读全局（globalThis 无类型面——标准做法——__DBG/__WF_DEBUG 等）' },
  { pattern: 'window as any).__dbgEvt', reason: 'debug 门控读全局 window（同上）' },
  { pattern: 'el.style as any', reason: 'CSSStyleDeclaration 动态键写（-- 自定义属性/camelCase——TS 索引面不足）' },
  { pattern: 'el as any)[key]', reason: 'DOM property 通道动态属性名（value/checked 等——属性名运行时已知白名单）' },
  { pattern: 'el as any).ownerDocument', reason: 'DOM 现值比较载体（ownerDocument 类型面不足——input-sync 组合态查询——2027-09 value 脱节修复）' },
  { pattern: 'el2 as any).value', reason: 'DOM value 现值读（HTMLInputElement 泛型面——property 通道运行时属性——2027-09 value 现值比较）' },
]

/** 提取 proc* 函数体（行区间——配对花括号） */
function procFunctionBodies(src, lines) {
  const out = []
  const fnRe = /export function (proc\w+)\(/g
  let m
  while ((m = fnRe.exec(src))) {
    const name = m[1]
    const nameLine = lines.findIndex((l) => l.includes(name))
    if (nameLine < 0) continue
    let depth = 0
    let started = false
    for (let i = nameLine; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') { depth++; started = true }
        else if (ch === '}') {
          depth--
          if (started && depth === 0) { out.push({ name, start: nameLine, end: i }); break }
        }
      }
      if (out.some((o) => o.name === name && o.end === i)) break
    }
  }
  return out
}

export function coreAudit() {
  const errors = []
  const warnings = []

  // ── C1：proc* 裸 return 标注 ──
  {
    const src = readFileSync(join(CORE_DIR, 'patch/processors.ts'), 'utf-8')
    const lines = src.split('\n')
    for (const fn of procFunctionBodies(src, lines)) {
      for (let li = fn.start; li <= fn.end; li++) {
        const trimmed = lines[li].trim()
        if (!trimmed.startsWith('return') && !/^\}?\s*return/.test(trimmed)) continue
        // 检查上方注释窗口（8 行内）是否有标注词
        const window = lines.slice(Math.max(0, li - 8), li).join('\n')
        if (!ANNOTATION_RE.test(window)) {
          errors.push(`C1 ${fn.name} 第 ${li + 1} 行裸 return 无语义标注（静默吞错路径——P2 条款）: ${trimmed.slice(0, 60)}`)
        }
      }
    }
  }

  // ── C2：as any 登记制 ──
  {
    const collect = (dir, files = []) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name)
        if (e.isDirectory() && !e.name.startsWith('.')) collect(p, files)
        else if (e.isFile() && e.name.endsWith('.ts')) files.push(p)
      }
      return files
    }
    for (const f of collect(CORE_DIR)) {
      const src = readFileSync(f, 'utf-8')
      const rel = f.replace(root + '/', '')
      for (const line of src.split('\n')) {
        if (!line.includes('as any')) continue
        const exempt = AS_ANY_EXEMPTIONS.some((e) => line.includes(e.pattern))
        if (!exempt) errors.push(`C2 ${rel}: 未登记 as any（白名单外——须登记理由或重构）: ${line.trim().slice(0, 80)}`)
      }
    }
  }

  return { errors, warnings }
}

// ── CLI ──
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const res = coreAudit()
  if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 2))
  else {
    console.log(`C1/C2 违规: ${res.errors.length}${res.errors.length ? '\n' + res.errors.map((e) => '  ✗ ' + e).join('\n') : ''}`)
    if (res.errors.length) process.exit(1)
  }
}
