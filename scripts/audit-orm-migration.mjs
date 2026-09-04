#!/usr/bin/env node
/**
 * audit-orm-migration.mjs —— 业务 sql 模板计数（orm 迁移进度/防回流）
 *
 * W4：升级为 src+test 双范围（三域扫描——防测试面 SQL 残留回流）：
 *   apps/agent-platform/src · apps/agent-platform/test · 框架 src（server+test 面）
 * 基线：ORM 协议层 AST 化后全库 0（W3 完成——parser/unsafe/tag 已消亡）——只降不升。
 * 纪律：
 *   - 每波次迁移完成 → 更新 BASELINE（只降不升——新增模板即红=CI 防回流）
 *   - 判负逃生舱须行内注释白名单（// orm-pg-filter / // orm-upsert-expr）——
 *     白名单行不计入（审计可见·不静默）
 *   - 框架侧扫描 src/server + src/test（sql 模板标签——含 `sql\`...\`` 形态）
 *
 * 用法：node scripts/audit-orm-migration.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
/** 三域（W4 双范围升级）——每域独立 baseline 0 */
const SCOPES = [
  { name: '平台 src', dir: 'apps/agent-platform/src', baseline: 0 },
  { name: '平台 test', dir: 'apps/agent-platform/test', baseline: 0 },
  { name: '框架 src', dir: 'src', baseline: 0, skip: (p) => p.includes('client/') }, // 客户端 vdom 组件不涉 SQL
]
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
let fail = false
for (const scope of SCOPES) {
  const dir = join(ROOT, scope.dir)
  const files = walk(dir)
    .filter((p) => !scope.skip?.(relative(join(ROOT, scope.dir), p)))
    .map((p) => relative(dir, p))
  let total = 0
  const perFile = []
  for (const f of files) {
    const lines = readFileSync(join(dir, f), 'utf-8').split('\n')
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
  console.log(`[${scope.name}] sql 模板总数: ${total}（baseline ${scope.baseline}）`)
  for (const [f, n] of perFile) console.log(`  ${String(n).padStart(3)}  ${f}`)
  if (total > scope.baseline) {
    console.error(`✗ [${scope.name}] 超过 baseline（${scope.baseline}）——新增模板被拦截（迁移应只减不增；逃生舱须白名单注释）`)
    fail = true
  } else {
    console.log(`✓ [${scope.name}] ok`)
  }
}
if (fail) process.exit(1)
console.log('✓ 全域 ok（防回流门——双范围 0）')
