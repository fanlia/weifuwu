#!/usr/bin/env node
/**
 * C4 质量评估脚本——场景模板评测（prompt/系统提示改动回归）
 *
 * 用法：node --env-file=.env scripts/eval.mjs [--cases test/eval-cases.json]
 *
 * 流程：每个用例 → 真实模型（默认 DEEPSEEK）→ 断言（关键词/长度/拒绝越界）→ 汇总
 * 输出：通过率 + 失败明细（JSON 行 + 摘要）
 *
 * 用途：改模板 prompt 前先跑（基线绿）→ 改后跑（回归红则回滚）
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ai } from 'weifuwu'

const __dirname = dirname(fileURLToPath(import.meta.url))
const casesPath = resolve(__dirname, '..', process.argv.includes('--cases')
  ? process.argv[process.argv.indexOf('--cases') + 1]
  : 'test/eval-cases.json')

const cases = JSON.parse(readFileSync(casesPath, 'utf-8'))

function checkExpect(content, expect) {
  const errors = []
  if (expect.maxLength && content.length > expect.maxLength) {
    errors.push(`超长 ${content.length} > ${expect.maxLength}`)
  }
  if (expect.minLength && content.length < expect.minLength) {
    errors.push(`过短 ${content.length} < ${expect.minLength}`)
  }
  if (expect.mustContain) {
    const miss = expect.mustContain.filter((k) => !content.includes(k))
    if (miss.length) errors.push(`缺少关键词(全部): ${miss.join('/')}`)
  }
  if (expect.mustContainAny) {
    const hit = expect.mustContainAny.filter((k) => content.includes(k))
    if (hit.length === 0) errors.push(`缺少关键词(任一): ${expect.mustContainAny.join('/')}`)
  }
  if (expect.mustNot) {
    const hit = expect.mustNot.filter((k) => content.includes(k))
    if (hit.length) errors.push(`包含禁止词: ${hit.join('/')}`)
  }
  return errors
}

const model = process.env.EVAL_MODEL ?? undefined
const a = ai({})

let pass = 0
const failures = []
console.log(`[eval] ${cases.length} 个用例 · 模型: ${model ?? '默认'}\n`)

for (const c of cases) {
  try {
    const res = await a.chat({
      model,
      messages: [
        { role: 'system', content: c.systemPrompt },
        { role: 'user', content: c.prompt },
      ],
      max_tokens: 500,
      temperature: 0.3,
    })
    const content = String(res?.choices?.[0]?.message?.content ?? '')
    const errors = checkExpect(content, c.expect)
    if (errors.length === 0) {
      pass++
      console.log(`  ✓ ${c.name}`)
    } else {
      failures.push({ name: c.name, errors, content: content.slice(0, 150) })
      console.log(`  ✗ ${c.name}: ${errors.join('; ')}`)
    }
  } catch (e) {
    failures.push({ name: c.name, errors: [`调用失败: ${e?.message ?? e}`], content: '' })
    console.log(`  ✗ ${c.name}: 调用失败`)
  }
}

const rate = Math.round((pass / cases.length) * 100)
console.log(`\n[eval] 通过率: ${pass}/${cases.length} (${rate}%)`)
if (failures.length) {
  console.log('\n失败明细：')
  for (const f of failures) {
    console.log(`  - ${f.name}: ${f.errors.join('; ')}`)
    if (f.content) console.log(`    回复: ${f.content}`)
  }
}
await a.close()
process.exit(rate === 100 ? 0 : 1)
