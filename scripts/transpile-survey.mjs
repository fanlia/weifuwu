#!/usr/bin/env node
/**
 * 转译问卷页面内联 module script（TS → JS——页面是纯 JS 环境——
 *  importmap + 浏览器直接执行——类型标注需 esbuild 去除）
 * 用法：node scripts/transpile-survey.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const files = ['survey-form.html', 'survey-stats.html']

for (const f of files) {
  const p = join(__dirname, '..', 'apps', 'agent-platform', 'public', f)
  let html = readFileSync(p, 'utf-8')
  const m = html.match(/<script type="module">([\s\S]*?)<\/script>/)
  if (!m) { console.log(`  ✗ ${f}: 无 module script`); continue }
  const { code } = transformSync(m[1], { loader: 'ts', target: 'es2020' })
  html = html.replace(m[1], code)
  writeFileSync(p, html)
  console.log(`  ✓ ${f}: 转译完成（${m[1].length} → ${code.length} 字符）`)
}
