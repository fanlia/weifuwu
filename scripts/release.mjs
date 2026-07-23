#!/usr/bin/env node
/**
 * Release script for weifuwu.
 *
 * Usage:
 *   node scripts/release.mjs <version>
 *   node scripts/release.mjs --dry-run 0.29.0
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
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

  // Step 1: Bump version
  const pkgPath = join(root, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkg.version = version
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`  ✓ version → ${version}`)

  // Step 2: Build
  run('npm run build', { env: { ...process.env, NODE_ENV: 'production' } })

  // Step 3: Validate
  if (!existsSync(join(root, 'dist', 'index.js'))) {
    console.error('  ✗ dist/index.js missing!')
    process.exit(1)
  }
  console.log('  ✓ weifuwu ready')

  if (dryRun) {
    console.log('\n  Dry run complete.')
    return
  }

  // Step 4: Commit version bump
  run('git add package.json')
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
