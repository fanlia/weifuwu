#!/usr/bin/env node
/**
 * audit-observable-complete — vdom 全链路 Observable 化完成三检查
 *
 * 红线（VDOM-OBSERVABLE-COMPLETE.md §0 完成定义——检测 = 完成判据）：
 * 1. core/ 与 hooks/ 无「阻塞 await 串联」的渲染周期（唯一保留：消费端
 *    applier 内 + 独立 mini-root 一次性渲染链（popup/toast/notification——
 *    已流消费（renderToStreamV2/pipeTo）——非周期））
 * 2. 无「双轨清理」（v2 Segment 无 onUnmounts 字段——onUnmount = destroy$
 *    单信号）
 * 3. 无「隐式时序」（toast 自动消失 setTimeout 裸调用——除外：调度器
 *    setTimeout（batching 拍）、心跳/重连退避（中间件可靠性——显式
 *    可取消）、Notification 组件层（组件实现——非 core 内核））
 *
 * 用法：node scripts/audit-observable-complete.mjs —— 违规退出码 1（CI 可挂）
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()

/** 域限定（core/ 与 hooks/——组件层不在红线域） */
const DOMAINS = ['src/client/vdom/core', 'src/client/vdom/hooks']

/** 豁免清单（登记制——每项带理由——新增需审计确认） */
const EXEMPT = [
  // 调度器拍（batching 时机——非隐式时序）
  [/\bsetTimeout\(/, 'src/client/vdom/core/v2/schedule.ts'],
  // 心跳/重连指数退避（中间件可靠性——显式可取消（clearTimeout））
  [/\bsetTimeout\(/, 'src/client/vdom/middlewares/ws.ts'],
  // 异步超时守卫（async-guard——Promise side race——显式 clearTimeout）
  [/\bsetTimeout\(/, 'src/client/vdom/core/async-guard.ts'],
  // afterRender 兜底调度（serve 未设 afterRender 时宏任务兜底——注释含断链实证）
  [/\bsetTimeout\(fn, 0\)/, 'src/client/vdom/core/v2/diff.ts'],
]

/** 剥离注释后的有效代码（// 行注释——避免注释文本误报） */
function stripComments(src) {
  return src.split('\n').map((line) => {
    const idx = line.indexOf('//')
    return idx >= 0 ? line.slice(0, idx) : line
  }).join('\n')
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) yield* walk(p)
    else if (name.endsWith('.ts')) yield p
  }
}

const violations = []

// ── 检查 2：双轨清理（v2 Segment 无 onUnmounts 字段） ──
for (const f of walk(join(root, 'src/client/vdom/core'))) {
  if (!f.endsWith('.ts')) continue
  const src = readFileSync(f, 'utf8')
  if (/onUnmounts\s*:\s*\(\)\s*=>\s*void/.test(src)) violations.push(`双轨清理：${rel(f)} —— onUnmounts 字段（应为 destroy$ 单信号）`)
}

// ── 检查 1+3：渲染周期 await 串联 + setTimeout 裸调用（隐式时序） ──
for (const domain of DOMAINS) {
  const dir = join(root, domain)
  if (!statSync(dir).isDirectory()) continue
  for (const f of walk(dir)) {
    const src = readFileSync(f, 'utf8')
    const code = stripComments(src)
    const lines = code.split('\n')
    const relp = rel(f)

    // 检查 3：setTimeout 裸调用（排除豁免 + 注释）
    lines.forEach((line, i) => {
      if (!/\bsetTimeout\(/.test(line)) return
      const exempt = EXEMPT.some(([re, path]) => re.test(line) && relp.endsWith(path))
      if (!exempt) violations.push(`隐式时序：${relp}:${i + 1} —— setTimeout 裸调用（应流上 delay/显式可取消）`)
    })

    // 检查 1：阻塞渲染周期（await collectCommands + 随后命令循环 apply——
    // 浏览器经 cycle 管线——SSR v2ToHtml（无 apply——序列化链——非周期）
    // 不在判据）
    if (/await collectCommands\(/.test(code) && /applier\.apply/.test(code)) {
      if (!relp.endsWith('serve.ts')) violations.push(`渲染周期 await 串联：${relp} —— collectCommands 后循环 apply（应经 cycle 管线）`)
    }
  }
}

function rel(p) {
  return p.slice(root.length + 1)
}

if (violations.length > 0) {
  console.error('✖ VDOM-OBSERVABLE-COMPLETE 三检查违规：\n')
  for (const v of violations) console.error('  ' + v)
  console.error(`\n共 ${violations.length} 处（豁免清单之外）`)
  process.exit(1)
}
console.log('✔ VDOM-OBSERVABLE-COMPLETE 三检查通过（渲染周期管线化 / 单轨清理 / 无隐式时序）')
