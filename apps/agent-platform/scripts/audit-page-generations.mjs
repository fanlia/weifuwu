/**
 * 页面世代哨兵（web W1——防回流 + 迁移可见性）
 *
 * 红（exit 1）：组件工厂期 async（`async (_p, ctx) =>`——工厂同步契约——
 * v2 段复用下 factory 期异步启动数据不刷新——Templates 先例教训）
 * 黄（warn）：老世代标记（ctx.render(/ctx.$（数据面调用）——迁移进度可见
 *   ——新世代 = useAsyncData（Templates 范本）
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const pages = readdirSync('ui/pages').filter((f) => f.endsWith('.tsx')).map((f) => join('ui/pages', f))
let asyncFactory = 0
let oldGen = 0
let newGen = 0
const oldFiles = []
for (const f of pages) {
  const s = readFileSync(f, 'utf8')
  // 红：工厂期 async——只查组件工厂签名（Component 类型绑定——`X: Component = async`）
  // 不误伤事件回调/局部函数（`const fn = async`——渲染无关合法——AGENTS.md）
  const isAsync = /[:=]\s*Component(?:<[^>]*>)?\s*=\s*(?:async\s*\(|[\w.]+\s*=>\s*async\s*\()/.test(s)
    || /export\s+const\s+\w+\s*:\s*Component[^=]*=\s*async\s*\(/.test(s)
  if (isAsync) { asyncFactory++; console.log(`  ✗ async 工厂: ${f}`) }
  // 老世代标记重定：`const load = (`（工厂期 load 模式——数据面启动在工厂期）
  // ——ctx.render() 是合法重渲染原语（不再标记——Agents 迁移后仍用于局部重渲染）
  const hasOld = /const\s+load\s*=\s*\(/.test(s) || /ctx\.\$/.test(s)
  const hasNew = /useAsyncData/.test(s)
  if (hasOld) { oldGen++; oldFiles.push(f.replace('ui/pages/', '')) }
  if (hasNew) newGen++
}
console.log(`页面 ${pages.length} · 新世代(useAsyncData) ${newGen} · 老世代(ctx.render/$) ${oldGen} · async 工厂 ${asyncFactory}`)
if (oldFiles.length) console.log('老世代:', oldFiles.join(' · '))
if (asyncFactory > 0) {
  console.error('✗ 工厂期 async 红——组件工厂同步契约（v2 段复用下数据不刷新）')
  process.exit(1)
}
console.log(asyncFactory === 0 ? '✔ 工厂同步契约守住' : '')
process.exit(0)
