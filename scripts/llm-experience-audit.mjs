#!/usr/bin/env node
/**
 * LLM/coder 使用体验模拟评估
 *
 * 模拟一个 coding agent 的任务："给客户做一个带登录的订单管理后台（weifuwu）"
 * 走查完整路径：发现 → 选型 → 理解 → 取码 → 写 → 验 → 交
 * 每个环节记录：✓ 顺畅 / ⚠ 有摩擦 / ✗ 断点（附证据）
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const report = []
const ok = (s) => report.push(`  ✓ ${s}`)
const warn = (s) => report.push(`  ⚠ ${s}`)
const fail = (s) => report.push(`  ✗ ${s}`)
let failures = 0

const R = (p) => join(root, p)
const read = (p) => { try { return readFileSync(R(p), 'utf-8') } catch { return null } }

console.log('════════════════════════════════════════════')
console.log('LLM 体验模拟评估——任务：带登录的订单管理后台')
console.log('════════════════════════════════════════════\n')

// ── 环节 1：发现 ──
console.log('【1. 发现】agent 进入仓库——能找到什么？')
const skill = read('.pi/skills/weifuwu-dev/SKILL.md')
if (skill) {
  const desc = skill.match(/description: >\n\s+(.+)/)?.[1]?.slice(0, 80)
  ok(`skill 存在（.pi/skills/weifuwu-dev/SKILL.md），description: "${desc}…"`)
  const refs = [...skill.matchAll(/`([^`]+\.md)`/g)].map((m) => m[1])
  const missing = refs.filter((r) => !existsSync(R(r)))
  missing.length === 0 ? ok(`SKILL.md 引用路径全部存在（${refs.length} 处）`) : fail(`SKILL.md 死引用：${missing.join(', ')}`)
} else fail('skill 不存在')
const idx = read('content/index.md')
idx ? ok('content/index.md 存在（文档入口）') : fail('content/index.md 缺失')

// ── 环节 2：选型 ──
console.log('\n【2. 选型】agent 读 choose.md 决策树——30 秒定位')
const choose = read('content/guides/choose.md')
if (choose) {
  for (const t of ['决策树', '管理后台', 'apps', 'examples/apps', '关键纪律']) {
    choose.includes(t) ? ok(`choose.md 含「${t}」`) : warn(`choose.md 缺「${t}」`)
  }
  // 决策树引用的路径是否可直达
  const linked = [...choose.matchAll(/`([^`]+\.md)`/g)].map((m) => m[1])
  const bad = linked.filter((l) => !existsSync(R(l)))
  bad.length === 0 ? ok('决策树引用路径全部有效') : fail(`死链：${bad.join(', ')}`)
} else fail('choose.md 缺失')

// ── 环节 3：理解 ──
console.log('\n【3. 理解】agent 读 apps/admin.md（架构/路由/改造指南）')
const adminDoc = read('content/apps/admin.md')
if (adminDoc) {
  for (const t of ['概述', '用到的页面模式', '用到的组件', '源码', '质量标准', '验证']) {
    adminDoc.includes(t) ? ok(`admin.md 含「${t}」`) : warn(`admin.md 缺「${t}」`)
  }
  // 文档引用的组件文档全部可达
  const compLinks = [...adminDoc.matchAll(/\.\.\/components\/([a-z0-9-]+)\.md/g)].map((m) => m[1])
  const missing = compLinks.filter((c) => !existsSync(R(`content/components/${c}.md`)))
  missing.length === 0 ? ok(`admin 关联组件文档全可达（${compLinks.length} 个）`) : fail(`组件文档缺失：${missing.join(', ')}`)
} else fail('admin.md 缺失')

// ── 环节 4：取码 ──
console.log('\n【4. 取码】agent 打开 examples/apps/admin/——复制即用')
const adminFiles = ['app.tsx', 'api.ts', 'server.ts', 'main.tsx']
for (const f of adminFiles) {
  existsSync(R(`examples/apps/admin/${f}`)) ? ok(`examples/apps/admin/${f} 存在`) : fail(`${f} 缺失`)
}
const appTsx = read('examples/apps/admin/app.tsx')
if (appTsx) {
  // 模板用到的组件都有文档
  const used = [...appTsx.matchAll(/import \{[^}]+\} from 'weifuwu\/components'/g)].flatMap((m) =>
    m[0].replace("import {", '').replace("} from 'weifuwu/components'", '').split(',').map((s) => s.trim().split(' as ')[0]))
  const noDoc = used.filter((u) => !existsSync(R(`content/components/${u.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`)))
  noDoc.length === 0 ? ok(`模板用到的 ${used.length} 个组件全部有文档`) : warn(`无文档组件：${noDoc.join(', ')}（可能为 Typography 别名等——应检查）`)
}

// ── 环节 5：写（组件 API 一致性检查）──
console.log('\n【5. 写】agent 按文档 API 开发——文档 vs 源码一致性')
const tableDoc = read('content/components/table.md') ?? ''
const tableSrc = read('src/client/components/Table/Table.ts') ?? ''
const tableProps = (tableSrc.match(/export interface TableProps \{[\s\S]*?\n\}/)?.[0] ?? '')
const docProps = [...tableDoc.matchAll(/`([a-zA-Z][a-zA-Z0-9]*)`/g)].map((m) => m[1])
const srcProps = [...tableProps.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1])
const missingProps = srcProps.filter((p) => !docProps.includes(p))
missingProps.length <= 3 ? ok(`Table props 文档覆盖（源码 ${srcProps.length} 个，文档未列 ${missingProps.length} 个）`) : warn(`Table 文档缺 props：${missingProps.join(', ')}`)

// 组件页 demo 覆盖率（agent 想"看它怎么动"）
const demos = readdirSync(R('apps/showcase/src/demos')).filter((f) => f.endsWith('.tsx') && f !== 'index.ts')
const demoCount = demos.reduce((n, f) => n + (read(`apps/showcase/src/demos/${f}`).match(/const Demo[A-Z]/g)?.length ?? 0), 0)
ok(`活体 demo 组件 ${demoCount} 个（9 分类文件）`)

// ── 环节 6：验证 ──
console.log('\n【6. 验证】agent 跑测试 + 质量 checklist')
const quality = read('content/guides/quality.md') ?? ''
const checks = (quality.match(/^## □/gm) ?? []).length
checks >= 5 ? ok(`quality.md 验收清单 ${checks} 节`) : warn(`quality checklist 仅 ${checks} 节`)
const verify = read('.pi/skills/weifuwu-dev/scripts/verify.mjs')
verify ? ok('verify.mjs 存在（质量自检可执行）') : fail('verify.mjs 缺失')
existsSync(R('src/cli/content-sync.test.ts')) && ok('防漂移测试存在（content 与 registry 同步）')

// ── 全局死链扫描 ──
console.log('\n【7. 全局健康——content/ 链接有效性】')
let total = 0, dead = 0
const walk = (dir) => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name)
    if (f.isDirectory()) walk(p)
    else if (f.name.endsWith('.md')) {
      const text = readFileSync(p, 'utf-8')
      for (const m of text.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
        const target = m[1]
        if (/^(https?:|mailto:|#)/.test(target)) continue
        total++
        const clean = target.replace(/\.\.\//g, '').replace(/^\.\//, '')
        // 相对 content/ 根解析
        const base = dir.replace(root + '/', '')
        const abs = resolve(root, base, target)
        if (!existsSync(abs) && !existsSync(abs.replace(/\.md$/, ''))) { dead++; if (dead <= 5) fail(`死链：${base}/${target}`) }
      }
    }
  }
}
walk(R('content'))
dead === 0 ? ok(`content/ 全部 ${total} 个相对链接有效`) : warn(`content/ 死链 ${dead}/${total}`)

// ── 结论 ──
console.log('\n════════════════════════════════════════════')
failures = report.filter((l) => l.startsWith('  ✗')).length
console.log(`评估结论：${failures === 0 ? '✅ 全流程顺畅' : `❌ ${failures} 处断点`}`)
console.log(report.join('\n'))
process.exit(failures === 0 ? 0 : 1)
