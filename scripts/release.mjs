#!/usr/bin/env node
/**
 * Release script for weifuwu.
 *
 * Usage:
 *   node scripts/release.mjs <version>
 *   node scripts/release.mjs --dry-run 0.29.0
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts })
}

function validateVersion(v) {
  return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const version = args.find(a => !a.startsWith('--'))

  if (!version || !validateVersion(version)) {
    console.error('Usage: node scripts/release.mjs [--dry-run] <version>')
    process.exit(1)
  }

  const tag = version.includes('-') ? 'next' : 'latest'
  console.log(`\n  weifuwu v${version} ${dryRun ? '(DRY RUN)' : ''}\n`)

  // Step 1: Bump version（**dry-run 不落盘 2026-08——版本漂移实证**：
  // dry-run 曾把 package.json version 写入并误提交——dry 语义 = 只验证
  // 流程不产生变更）
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  if (dryRun) {
    console.log(`  ✓ version → ${version} (dry-run——不落盘)`)
  } else {
    pkg.version = version
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    console.log(`  ✓ version → ${version}`)
  }

  // Step 2: Build
  run('npm run build', { env: { ...process.env, NODE_ENV: 'production' } })

  // Step 3: Validate
  // **产物结构（2026-08 修正）**：build.mjs 后端入口 → dist/server/index.js
  // （package.json exports "." 指向）——非历史假设的 dist/index.js——
  // release:dry 曾恒失败（陈旧校验）——按 exports 实际指向校验
  const serverEntry = join(root, 'dist', 'server', 'index.js')
  if (!existsSync(serverEntry)) {
    console.error('  ✗ dist/server/index.js missing!')
    process.exit(1)
  }
  console.log('  ✓ weifuwu ready (dist/server/index.js)')

  // Step 3.75: CHANGELOG 自动生成（版本节奏纪律——01 生态计划 P2：每版强制）
  // 从上一 tag 到 HEAD 的 conventional commits 分组提取——禁止手工维护
  // **dry-run 不落盘**（2027-09 修复：changelog 写入缺 dry 守卫——dry-run 曾
  // 重复写入 [version] 段（published changelog 出现两份）——与 package.json
  // 版本同口径——dry 语义 = 只验证流程不产生变更）
  const changelogPath = join(root, 'CHANGELOG.md')
  if (!dryRun) try {
    const prevTag = execSync('git describe --tags --abbrev=0 HEAD~1', { cwd: root }).toString().trim()
    const log = execSync(`git log --oneline ${prevTag}..HEAD --grep="release:" --invert-grep`, { cwd: root }).toString().trim()
    const groups = { feat: [], fix: [], docs: [], test: [], chore: [], other: [] }
    for (const line of log.split('\n')) {
      const m = line.match(/^\w+ ((?:feat|fix|docs|test|chore))(?:\([^)]*\))?: (.+)$/)
      if (m) groups[m[1]].push(m[2].trim())
      else if (line) groups.other.push(line.replace(/^\w+\s/, '').trim())
    }
    const title = { feat: '### Added', fix: '### Fixed', docs: '### Docs', test: '### Tests', chore: '### Chore', other: '### Other' }
    const entry = [`## [${version}] - ${new Date().toISOString().slice(0, 10)}`, '']
    for (const [k, label] of Object.entries(title)) {
      if (groups[k].length) entry.push(label, '', ...groups[k].map((x) => `- ${x}`), '')
    }
    let changelog = readFileSync(changelogPath, 'utf-8')
    const UNREL = '## [Unreleased]\n\n（release.mjs 发布时自动生成——不要手写）\n\n'
    changelog = changelog.replace(UNREL, `## [Unreleased]\n\n（release.mjs 发布时自动生成——不要手写）\n\n${entry.join('\n').trim()}\n\n`)
    writeFileSync(changelogPath, changelog)
    console.log(`  ✓ CHANGELOG → ${version}（${groups.feat.length + groups.fix.length + groups.docs.length + groups.test.length + groups.chore.length} 条主题）`)
  } catch (e) {
    console.warn('  ⚠ CHANGELOG 生成跳过（无上一 tag：' + (e.message ?? e).slice(0, 80) + '）')
  }

  if (dryRun) {
    console.log('\n  Dry run complete.')
    return
  }

  // Step 4: Commit version bump
  run('git add package.json CHANGELOG.md')
  run(`git commit -m "release: v${version}"`)

  // Step 5: Publish
  console.log(`\n  Publishing weifuwu@${version}...`)
  run(`npm publish --tag ${tag}`)

  // Step 6: Tag + push
  run(`git tag v${version}`)
  run(`git push origin v${version}`)
  run('git push origin')

  console.log(`\n  ✅ weifuwu v${version} released`)
}

main().catch(err => { console.error(err); process.exit(1) })
