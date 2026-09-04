#!/usr/bin/env node
/**
 * audit-orm-migration.mjs —— 平台业务 sql 模板计数（orm 迁移进度/防回流）
 *
 * 读数 = apps/agent-platform/src 下 `sql\`...\`` 标签模板计数（baseline 350——
 * platform-orm-迁移.md §1 探针）。
 * 纪律：
 *   - 每波次迁移完成 → 更新 BASELINE（只降不升——新增模板即红=CI 防回流）
 *   - 判负逃生舱须行内注释白名单（// orm-pg-filter / // orm-upsert-expr）——
 *     白名单行不计入（审计可见·不静默）
 *
 * 用法：node scripts/audit-orm-migration.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = join(ROOT, 'apps/agent-platform/src')
/** 当前基线（P0-P6 每波次递减——只减不增） */
const BASELINE = 0
const WHITELIST_RE = /\/\/\s*orm-(pg-[\w-]+|upsert-[\w-]+|upsert|subquery)/

function walk(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (p.endsWith('.ts')) out.push(p)
  }
  return out
}

/** 行级扫描：sql` 模板（含白名单行）——与探针 grep -c 'sql`' 同口径 */
const files = walk(SRC).map((p) => relative(SRC, p))
let total = 0
const perFile = []
for (const f of files) {
  const lines = readFileSync(join(SRC, f), 'utf-8').split('\n')
  let n = 0
  for (const line of lines) {
    if (!line.includes('sql`')) continue
    if (WHITELIST_RE.test(line)) continue // 判负逃生舱白名单——不计
    n++
  }
  if (n) perFile.push([f, n])
  total += n
}
perFile.sort((a, b) => b[1] - a[1])
console.log(`sql 模板总数: ${total}（baseline ${BASELINE}）`)
for (const [f, n] of perFile) console.log(`  ${String(n).padStart(3)}  ${f}`)
if (total > BASELINE) {
  console.error(`✗ 超过 baseline（${BASELINE}）——新增模板被拦截（迁移应只减不增；逃生舱须白名单注释）`)
  process.exit(1)
}
console.log('✓ ok（防回流门）')
