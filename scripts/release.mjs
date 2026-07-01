#!/usr/bin/env node
/**
 * Release script for weifuwu monorepo.
 *
 * Usage:
 *   node scripts/release.mjs <version>        # Full release
 *   node scripts/release.mjs 0.28.0           # Publish v0.28.0
 *   node scripts/release.mjs --dry-run 0.28.0 # Dry run (no publish)
 *
 * Workflow:
 *   1. Validate version format
 *   2. Update all package.json versions
 *   3. Build all packages (core → react → cli)
 *   4. Generate .d.ts declarations
 *   5. Publish in order: core → react → cli
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const PKGS = ['core', 'react', 'create-weifuwu']

const PUBLISH_ORDER = [
  { dir: 'core', name: '@weifuwujs/core', public: true },
  { dir: 'react', name: '@weifuwujs/react', public: true },
  { dir: 'create-weifuwu', name: 'create-weifuwu', public: true },
]

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: root, ...opts })
}

function readPkg(dir) {
  return JSON.parse(readFileSync(join(root, 'packages', dir, 'package.json'), 'utf-8'))
}

function writePkg(dir, data) {
  writeFileSync(join(root, 'packages', dir, 'package.json'), JSON.stringify(data, null, 2) + '\n')
}

function validateVersion(v) {
  return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(v)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const version = args.find(a => !a.startsWith('--'))

  if (!version) {
    console.error('Usage: node scripts/release.mjs [--dry-run] <version>')
    console.error('  e.g. node scripts/release.mjs 0.28.0')
    process.exit(1)
  }

  if (!validateVersion(version)) {
    console.error(`Invalid version: "${version}". Expected semver (e.g. 0.28.0)`)
    process.exit(1)
  }

  const tag = version.includes('-') ? 'next' : 'latest'

  console.log(`\n══════════════════════════════════════════`)
  console.log(`  weifuwu Release v${version}${dryRun ? ' (DRY RUN)' : ''}`)
  console.log(`  Tag: ${tag}`)
  console.log(`══════════════════════════════════════════\n`)

  // ── Step 1: Update versions ──
  console.log('── Step 1: Update versions ──')
  for (const pkg of PKGS) {
    const pkgPath = join(root, 'packages', pkg, 'package.json')
    if (!existsSync(pkgPath)) {
      console.warn(`  ⚠  packages/${pkg}/package.json not found, skipping`)
      continue
    }
    const data = JSON.parse(readFileSync(pkgPath, 'utf-8'))
    data.version = version
    writePkg(pkg, data)
    console.log(`  ✓ ${data.name} → ${version}`)
  }
  // Also root package.json
  const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
  rootPkg.version = version
  writeFileSync(join(root, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n')
  console.log(`  ✓ root → ${version}`)

  // ── Step 2: Build ──
  console.log('\n── Step 2: Build all packages ──')
  run('npm run build', { env: { ...process.env, NODE_ENV: 'production' } })

  // ── Step 3: Generate .d.ts declarations ──
  console.log('\n── Step 3: Generate type declarations ──')

  // @weifuwujs/core
  const corePkg = join(root, 'packages', 'core')
  const coreDist = join(corePkg, 'dist')
  if (existsSync(join(corePkg, 'tsconfig.json')) && existsSync(coreDist)) {
    run(`npx tsc --project "${join(corePkg, 'tsconfig.json')}" --emitDeclarationOnly --outdir "${coreDist}"`, {
      cwd: corePkg,
    })
    console.log('  ✓ @weifuwujs/core declarations emitted')
  }

  // @weifuwujs/react (uses core's dist .d.ts for type resolution)
  const reactPkg = join(root, 'packages', 'react')
  const reactDist = join(reactPkg, 'dist')
  if (existsSync(join(reactPkg, 'tsconfig.declaration.json')) && existsSync(reactDist)) {
    // Ensure core .d.ts exists before generating react's
    if (!existsSync(join(coreDist, 'index.d.ts'))) {
      console.error('  ✗ @weifuwujs/core declarations missing — run core step first')
      process.exit(1)
    }
    run(`npx tsc --project "${join(reactPkg, 'tsconfig.declaration.json')}" --emitDeclarationOnly --outdir "${reactDist}"`, {
      cwd: reactPkg,
    })
    console.log('  ✓ @weifuwujs/react declarations emitted')
  }

  // ── Step 4: Validate ──
  console.log('\n── Step 4: Validate packages ──')
  for (const pkg of PUBLISH_ORDER) {
    const pkgPath = join(root, 'packages', pkg.dir)
    const data = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'))

    // Check entry exists (cli → dist/cli.js, others → dist/index.js)
    let entryPath
    if (pkg.dir === 'create-weifuwu') entryPath = join(pkgPath, 'dist', 'cli.js')
    else entryPath = join(pkgPath, 'dist', 'index.js')
    if (pkg.public && !existsSync(entryPath)) {
      console.error(`  ✗ ${pkg.name}: ${entryPath} missing!`)
      process.exit(1)
    }

    // Check private flag
    if (data.private) {
      console.log(`  ⚠ ${pkg.name}: private, will NOT be published`)
    } else {
      console.log(`  ✓ ${pkg.name} ready`)
    }
  }

  // ── Step 5: Publish (unless dry-run) ──
  if (dryRun) {
    console.log('\n── Step 5: Publish (SKIPPED - dry run) ──')
    console.log('\n✅ Dry run complete. To publish:')
    console.log(`   node scripts/release.mjs ${version}`)
    return
  }

  console.log('\n── Step 5: Publish ──')
  for (const pkg of PUBLISH_ORDER) {
    const pkgPath = join(root, 'packages', pkg.dir)
    const data = JSON.parse(readFileSync(join(pkgPath, 'package.json'), 'utf-8'))

    if (data.private) {
      console.log(`  - ${pkg.name}: private, skipped`)
      continue
    }

    const access = pkg.name.startsWith('@') ? '--access public' : ''
    console.log(`  Publishing ${pkg.name}@${version}...`)
    try {
      run(`npm publish --tag ${tag} ${access}`, { cwd: pkgPath })
      console.log(`  ✓ ${pkg.name} published`)
    } catch (err) {
      console.error(`  ✗ ${pkg.name} publish failed: ${err.message}`)
      console.error('  Continuing with next package...')
    }
  }

  // ── Step 6: Git tag ──
  console.log('\n── Step 6: Git tag ──')
  try {
    run(`git tag v${version}`)
    run(`git push origin v${version}`)
    console.log(`  ✓ Tagged v${version}`)
  } catch (err) {
    console.warn(`  ⚠ Git tag failed: ${err.message}`)
  }

  console.log(`\n══════════════════════════════════════════`)
  console.log(`  ✅ Release v${version} complete!`)
  console.log(`══════════════════════════════════════════`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
