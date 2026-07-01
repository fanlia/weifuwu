#!/usr/bin/env node
/* eslint-disable no-console */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkgRoot = existsSync(join(__dirname, 'package.json')) ? __dirname : resolve(__dirname, '..')

async function readPkg() {
  return JSON.parse(
    await import('node:fs/promises').then((fs) =>
      fs.readFile(join(pkgRoot, 'package.json'), 'utf-8'),
    ),
  )
}

async function cmdVersion() {
  const pkg = await readPkg()
  console.log(pkg.version)
}

async function cmdInit(name: string, opts: { skipInstall?: boolean }) {
  const targetDir = resolve(process.cwd(), name)

  if (existsSync(targetDir)) {
    console.error(`Directory ${name} already exists.`)
    process.exit(1)
  }

  const pkg = await readPkg()
  await generateMinimal(targetDir, name, pkg.version, opts.skipInstall)
}

// ── Minimal (API-only) project ─────────────────────────────────────────

async function generateMinimal(
  targetDir: string,
  name: string,
  version: string,
  skipInstall?: boolean,
) {
  await mkdir(targetDir, { recursive: true })

  await writeFile(
    join(targetDir, 'app.ts'),
    [
      `import { Router } from 'weifuwu'`,
      ``,
      `export const app = new Router()`,
      ``,
      `app.get('/', () => new Response('Hello from ${name}!'))`,
      `app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))`,
      ``,
    ].join('\n'),
  )

  await writeFile(
    join(targetDir, 'index.ts'),
    [
      `import { loadEnv, serve } from 'weifuwu'`,
      `import { app } from './app.ts'`,
      ``,
      `loadEnv()`,
      `const port = Number(process.env.PORT) || 3000`,
      `serve(app.handler(), { port })`,
      ``,
    ].join('\n'),
  )

  await writePackageJson(targetDir, name, version, {})
  await writeCommonFiles(targetDir)
  await finishInit(targetDir, skipInstall)
}

// ── Shared helpers ─────────────────────────────────────────────────────

async function writePackageJson(
  targetDir: string,
  name: string,
  version: string,
  extra: Record<string, unknown>,
) {
  const pkg: Record<string, unknown> = {
    name,
    type: 'module',
    scripts: {
      dev: 'node --watch index.ts',
      start: 'node index.ts',
    },
    ...extra,
  }
  await writeFile(join(targetDir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
}

async function writeCommonFiles(targetDir: string) {
  await writeFile(join(targetDir, '.gitignore'), 'node_modules\n.env\n.weifuwu\n')
  await writeFile(join(targetDir, '.env'), 'PORT=3000\n')
}

async function finishInit(targetDir: string, skipInstall?: boolean) {
  if (!skipInstall) {
    console.log('\nInstalling dependencies...')
    execSync('npm install', { cwd: targetDir, stdio: 'inherit' })
  }

  console.log(`\n✅ Created ${targetDir.split('/').pop()}/`)
  console.log(`   cd ${targetDir.split('/').pop()}`)
  if (skipInstall) console.log(`   npm install`)
  console.log(`   npm run dev`)
}

// ── CLI entry ──────────────────────────────────────────────────────────

const cmd = process.argv[2]

const HELP = `
weifuwu — Web-standard HTTP microframework for Node.js

Usage:
  npx weifuwu init <name>               Create a new project
  npx weifuwu init <name> --skip-install  Skip npm install
  npx weifuwu version                   Print version
`

if (cmd === 'version' || cmd === '-v' || cmd === '--version') {
  cmdVersion().catch(console.error)
} else if (cmd === 'init') {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(3),
    options: {
      'skip-install': { type: 'boolean' },
    },
    strict: false,
    allowPositionals: true,
  })
  const name = positionals[0]
  if (!name) {
    console.error('Usage: npx weifuwu init <name> [--skip-install]')
    process.exit(1)
  }
  cmdInit(name, { skipInstall: !!values['skip-install'] }).catch(
    console.error,
  )
} else {
  console.log(HELP)
}
