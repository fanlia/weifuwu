#!/usr/bin/env node
/**
 * audit-observable-optimize — VDOM-OBSERVABLE-OPTIMIZE 完成三检查
 *
 * 检查（design/VDOM-OBSERVABLE-OPTIMIZE.md §0 完成定义）：
 * 1. **调度器无隐式时序**：schedule.ts 无 setTimeout(0) 风暴清零 hack——
 *    风暴检测 = 事件间隔判定（<16ms 计数 / ≥16ms 重置——显式时序）
 * 2. **组合算子面在**：combineLatest/merge/debounceTime/throttleTime/
 *    distinctUntilChanged/finalize/take/startWith 全部导出（公共面）
 * 3. **失败可观测**：useAsyncData error 路径入 asyncErrors$（非仅
 *    console.error）+ derived 单一实现源（store.ts）
 *
 * 用法：node scripts/audit-observable-optimize.mjs —— 违规退出码 1
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const violations = []

const read = (p) => readFileSync(join(root, p), 'utf8')

// ── 检查 1：调度器无隐式时序 ──
const sched = read('src/client/vdom/core/v2/schedule.ts')
if (!/STORM_GAP_MS|lastFlushAt/.test(sched)) violations.push('调度器缺事件间隔判定（应为时间戳判定而非 timer 清零）')
if (/setTimeout\(\s*\(\)\s*=>\s*\{?\s*if\s*\(\s*consecutive/.test(sched)) violations.push('调度器 setTimeout 风暴清零 hack 残留')

// ── 检查 2：组合算子面 ──
const idx = read('src/client/vdom/observable/index.ts')
const wanted = ['combineLatest', 'merge', 'debounceTime', 'throttleTime', 'distinctUntilChanged', 'finalize', 'take', 'startWith']
for (const op of wanted) {
  if (!new RegExp(`\\b${op}\\b`).test(idx)) violations.push(`组合算子缺失：${op}`)
}

// ── 检查 3：失败可观测 + 派生单源 ──
const envSrc = read('src/client/vdom/hooks/env.ts')
if (!/asyncErrors\$\.next/.test(envSrc)) violations.push('useAsyncData 错误未入流（asyncErrors$ 缺失）')
const storeSrc = read('src/client/vdom/store.ts')
if (!/export function derived/.test(storeSrc)) violations.push('derived 单一实现源缺失（store.ts）')
const derivCount = (read('src/client/vdom/index.ts').match(/\bderived\b/g) ?? []).length
if (derivCount < 1) violations.push('derived 公共面未导出')

if (violations.length > 0) {
  console.error('✖ VDOM-OBSERVABLE-OPTIMIZE 三检查违规：\n')
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
}
console.log('✔ VDOM-OBSERVABLE-OPTIMIZE 三检查通过（调度时序显式 / 组合算子面在 / 失败可观测）')
