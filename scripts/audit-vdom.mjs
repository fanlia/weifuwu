#!/usr/bin/env node
/**
 * vdom 缺陷模式哨兵（VDOM-CORE-EXCELLENCE-PLAN 波次 B——2027-10）
 *
 * 历史内核缺陷都是「模式级」的（G9 重复 key / G10 removalParent /
 * G11 可变输出 / null 纪律 / keyedId 前缀 / Icon 崩溃）——模式可 grep、
 * 可机制化、可红线（阶段 2 audit:interactivity 经验平移）。
 *
 * 六红线 + 豁免登记制（file + pattern + why——新增硬编码 = 审计失败）：
 * ① lastOutput `!== null` 判定（null 纪律——空洞输出必须 `!== undefined`——
 *   4 处遗漏实证 root.0.0(div) 幽灵/锚残留）
 * ② 单锚 remove keyed 组件项（removeVNodeTree 区间单一实现源——compId
 *   子空间物理节点单锚够不着——D5 扩维 fuzz 幽灵 id 实证）
 * ③ id 裸前缀 startsWith（无 `+ '.'` 分隔——keyedId 转义回归面——
 *   G10 unmount root.0.ka 误删 root.0.ka.b 实证）
 * ④ 裸索引访问无兜底（`PATHS[name].map` renderFn 崩溃——hole 降级循环
 *   刷日志——statcard zap 实证——须 `??` fallback）
 * ⑤ core/ 渲染路径 timer（renderFn 同步段副作用——effect-guard 运行时
 *   守卫的静态面补齐——DemoProgress 实证）
 * ⑥ 手写空洞/空串判定（kindOf 单一实现源——''→hole 双 bug 实证——
 *   已由 audit:semantics 覆盖——此处对齐豁免表）
 *
 * 案例库映射（哨兵规则 ↔ 契约锁定——防回潮双向）：
 * ②→ fuzz-robust D5/D6 + reconcile G2/G8（区间/嵌套卸载）
 * ③→ key-inject.test.ts（keyedId 转义/前缀误删回归）
 * ④→ icon.test.ts（未知 name fallback + warn 去重）
 * ⑤→ effect-guard.test.ts（渲染路径副作用 6 测试）
 * ⑥→ audit:semantics + kindOf 契约（transform vnode/测试）
 *
 * 用法：node scripts/audit-vdom.mjs（exit 1 = 违例）
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src/client/vdom'

/** 豁免登记（file → 行必须匹配的模式 + why——只能缩小不可扩大） */
const EXEMPT = {
  prefix: [
    // 带分隔符 `+ '.'` 的前缀匹配（id 后代边界——keyedId 转义后安全）
    { pat: /startsWith\((?:oldPrefix|id|prefix) \+ '\.'\)/, why: '带 . 分隔符的后代边界（remapSubtree/dispose 语义）' },
    { pat: /startsWith\(value\)/, why: 'absorb.ts 文本值前缀匹配（SSR 吸收 splitText——值语义非 id）' },
    { pat: /value\.startsWith\('\$fn'\)/, why: 'ssr 传输协议标记（$fn 表——非 id）' },
    { pat: /startsWith\(prefix\)/, why: 'patch/processors 插入序扫描（prefix 为已转义 keyedId——转义保证无假前缀）' },
    { pat: /startsWith\('--'\)|startsWith\('aria-'\)|startsWith\('data:'\)|startsWith\('data: '\)|startsWith\('event:'\)|startsWith\('event: '\)|startsWith\('http'\)|startsWith\('#'\)/, why: '字符串值语义前缀（CSS 变量/aria/SSE/链接——非 id 空间）' },
    { pat: /k\.startsWith\(POS_KEY_PREFIX\)/, why: 'keyed.ts 位置 key 判定（positionKey 常量——keyOf 域内）' },
    { pat: /href\.startsWith/, why: 'serve.ts 链接拦截分类（href 值语义）' },
  ],
  timer: [
    { file: 'middlewares/api.ts', pat: /setTimeout.*abort/, why: '请求超时 abort（I/O 域——事件回调期非渲染路径）' },
    { file: 'middlewares/ws.ts', pat: /setTimeout|setInterval/, why: '连接重试/心跳（I/O 域——ws 生命周期）' },
    { file: 'core/async-guard.ts', pat: /setTimeout|setInterval/, why: 'async-guard 守卫自身（timer 检测器——元层）' },
    { file: 'dev/effect-guard.ts', pat: /setTimeout|setInterval/, why: 'effect-guard 守卫自身（timer 检测器——元层）' },
    { file: 'observable/operators.ts', pat: /setTimeout|setInterval/, why: 'Observable 时间算子（delay/debounce/throttle——算子本身即时间管理）' },
    { file: 'hooks/stable.ts', pat: /setTimeout|setInterval/, why: 'hook 定时器（useTween/rAF 节流——工厂期创建 + ctx.ui.hold 清理）' },
    { file: 'browser/', pat: /setTimeout|setInterval/, why: '浏览器桥（I/O 域）' },
    { file: 'dev/render-health.ts', pat: /setTimeout|setInterval/, why: '诊断器自身（2s 滚动窗口——元层）' },
    { file: 'hooks/popup-manager.ts', pat: /setTimeout|setInterval/, why: 'popup presence 退场（命令式内核——事件回调期）' },
    { file: 'hooks/chat.ts', pat: /setTimeout|setInterval/, why: 'chat 流（I/O 域）' },
    { file: 'hooks/ai-stream.ts', pat: /setTimeout|setInterval/, why: 'AI 流（I/O 域）' },
    { file: 'hooks/env.ts', pat: /setTimeout|setInterval/, why: 'env hooks（useTween 等——同 stable）' },
    { file: 'core/v2/diff.ts', pat: /setTimeout/, why: 'diff.ts:98 scheduleAfterRender fallback（afterRender 缺失环境兜底——非 renderFn 同步段）' },
  ],
  // ⑥ 手写空洞判定的域豁免（与 audit:semantics 豁免表对齐——非 vnode 渲染语义）
  holeFree: [
    { dir: 'core/field/', why: 'field 域（attribute/style/key 值处理——非 vnode）' },
    { dir: 'core/ssr/', why: 'ssr 序列化（attrsToHtml 传输层）' },
    { dir: 'core/transform/states.ts', why: 'stateOf 早退（kindOf 兜底——audit:semantics 同豁免）' },
    { dir: 'core/async-guard.ts', why: '守卫自身（元层）' },
    { dir: 'hooks/', why: 'hooks 业务值（content/段等——非 vnode 渲染语义）' },
    { dir: 'observable/', why: 'Observable 数据面（值语义）' },
    { dir: 'middlewares/', why: '中间件数据面' },
    { dir: 'browser/', why: '浏览器桥' },
  ],
}

const violations = []
const allowed = []

function scan(relFile, src) {
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const code = raw.replace(/\/\/.*$/, '')
    if (!code.trim() || /^\s*[\/*]/.test(raw)) continue
    const where = `${relFile}:${i + 1}`
    // ① lastOutput null 判定
    if (/lastOutput\s*[!=]==?\s*null|null\s*[!=]==?\s*\w*\.lastOutput/.test(code)) {
      violations.push(`① ${where} lastOutput null 判定（空洞输出必须 !== undefined——null 纪律）`)
      continue
    }
    // ② 单锚 remove 组件项（op:'remove' 行上下文含组件判定——区间豁免）
    if (/op:\s*'remove'/.test(code)) {
      // 同行含 keepSegments/removeTreeV2 = 区间路径合法；上下文 keyOf+type function = 红已修形态
      const ctx = lines.slice(Math.max(0, i - 6), i + 2).join('\n')
      if (/type === 'function'/.test(ctx) && !/removeTreeV2|keepSegments/.test(ctx)) {
        violations.push(`② ${where} 单锚 remove 组件项（须 removeTreeV2 区间——compId 子空间单锚够不着）`)
        continue
      }
      allowed.push(`② ${where}（元素/锚单锚合法）`)
    }
    // ③ id 裸前缀
    if (/\.startsWith\(/.test(code)) {
      const hit = EXEMPT.prefix.find((e) => e.pat.test(code))
      if (hit) { allowed.push(`③ ${where}（${hit.why}）`); continue }
      if (!/\+ '\.'/.test(code)) {
        violations.push(`③ ${where} id 裸前缀 startsWith（须 + '.' 后代边界——keyedId 转义回归）`)
        continue
      }
      allowed.push(`③ ${where}（带分隔符）`)
    }
    // ④ 裸索引调用（[key].method 无 ?? 兜底）
    {
      const m = code.match(/\['(\w+)'\]\.(\w+)\(/)
      if (m && !/\?\?/.test(code) && !/keys\(\)|includes|push|charAt|split|set\(|get\(|delete\(|has\(/.test(code)) {
        violations.push(`④ ${where} 裸索引 .${m[2]}( 无 ?? 兜底（未知键崩溃——renderFn 降级循环）`)
        continue
      }
    }
    // ⑤ 渲染路径 timer（core/ 红线——其他域豁免登记）
    if (/setTimeout|setInterval/.test(code)) {
      const hit = EXEMPT.timer.find((e) => relFile.includes(e.file) && e.pat.test(code))
      if (hit) { allowed.push(`⑤ ${where}（${hit.why}）`); continue }
      if (relFile.startsWith('core/') && !relFile.includes('async-guard')) {
        violations.push(`⑤ ${where} core/ 渲染路径 timer（同步段副作用——effect-guard 红线）`)
        continue
      }
      violations.push(`⑤ ${where} timer 未登记（EXEMPT.timer 补 why 或移除）`)
      continue
    }
    // ⑥ 手写空洞判定（=== null || === undefined 组合——kindOf 外）
    if (/(=== null \|\| \w+ === undefined)|(=== undefined \|\| \w+ === null)/.test(code) && !relFile.includes('node/')) {
      const hf = EXEMPT.holeFree.find((e) => relFile.startsWith(e.dir))
      if (hf) { allowed.push(`⑥ ${where}（${hf.why}）`); continue }
      violations.push(`⑥ ${where} 手写空洞判定（须 isHoleKind——kindOf 单一实现源）`)
      continue
    }
  }
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry)
    if (statSync(abs).isDirectory()) { walk(abs); continue }
    if (!abs.endsWith('.ts') || abs.includes('.test.')) continue
    scan(abs.replace(/^src\/client\/vdom\//, ''), readFileSync(abs, 'utf8'))
  }
}
walk(ROOT)

console.log(`vdom 缺陷模式哨兵：合法登记 ${allowed.length} 行 / 违例 ${violations.length} 行`)
for (const v of violations) console.log(`  ✖ ${v}`)
if (violations.length) process.exit(1)
console.log('✔ 六红线全绿（null 纪律/区间移除/id 前缀/裸索引/渲染 timer/kindOf 单源）')
