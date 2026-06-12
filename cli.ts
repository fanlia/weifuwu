#!/usr/bin/env node
import { mkdir, writeFile, copyFile, readFile, cp } from 'node:fs/promises'
import { existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkgRoot = existsSync(join(__dirname, 'package.json')) ? __dirname : resolve(__dirname, '..')

async function readPkg(): Promise<any> {
  return JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf-8'))
}

// ── Commands ────────────────────────────────────────────────────────────

async function cmdSkill() {
  const targetDir = join(homedir(), '.agents', 'skills', 'weifuwu')
  await mkdir(targetDir, { recursive: true })
  await copyFile(join(pkgRoot, 'README.md'), join(targetDir, 'SKILL.md'))
  console.log('✅ Installed weifuwu skill to ~/.agents/skills/weifuwu/')
}

async function cmdVersion() {
  const pkg = await readPkg()
  console.log(pkg.version)
}

async function cmdInit(name: string, opts: { minimal?: boolean; skipInstall?: boolean }) {
  const targetDir = resolve(process.cwd(), name)
  const pkg = await readPkg()
  const v = pkg.version
  const depVer = (depName: string) =>
    `^${(pkg.devDependencies?.[depName] || '0.0.0').replace(/^\^/, '')}`

  await mkdir(targetDir, { recursive: true })

  // Copy templates
  const templateDir = join(pkgRoot, 'cli', 'template')
  await cp(templateDir, targetDir, { recursive: true })

  // Rewrite local imports → package imports
  for (const file of ['app.ts', 'index.ts']) {
    const fp = join(targetDir, file)
    let content = await readFile(fp, 'utf-8')
    content = content
      .replace(/from '\.\.\/\.\.\/index\.ts'/g, "from 'weifuwu'")
      .replace(/from '\.\.\/\.\.\/\.\.\/react\.ts'/g, "from 'weifuwu/react'")
    await writeFile(fp, content)
  }

  // Rewrite UI imports
  const uiPage = join(targetDir, 'ui', 'app', 'page.tsx')
  if (existsSync(uiPage)) {
    let content = await readFile(uiPage, 'utf-8')
    content = content
      .replace(/from '\.\.\/\.\.\/\.\.\/\.\.\/react\.ts'/g, "from 'weifuwu/react'")
    await writeFile(uiPage, content)
  }

  // Minimal mode: strip SSR/i18n/theme, keep only HTTP core
  if (opts.minimal) {
    // Remove UI directory
    await cp(join(templateDir, '..', '..', '..'), '/dev/null') // noop
    try { await rmrf(join(targetDir, 'ui')) } catch {}
    try { await rmrf(join(targetDir, 'locales')) } catch {}

    // Write minimal app.ts
    await writeFile(join(targetDir, 'app.ts'), [
      `import { Router } from 'weifuwu'`,
      ``,
      `export const app = new Router()`,
      ``,
      `app.get('/', () => new Response('Hello from ${name}!'))`,
      `app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))`,
      ``,
    ].join('\n'))

    // Write minimal index.ts
    await writeFile(join(targetDir, 'index.ts'), [
      `import { serve } from 'weifuwu'`,
      `import { app } from './app.ts'`,
      ``,
      `const port = Number(process.env.PORT) || 3000`,
      `serve(app.handler(), { port })`,
      ``,
    ].join('\n'))
  }

  // Write package.json
  const deps: Record<string, string> = { weifuwu: `^${v}` }
  const devDeps: Record<string, string> = {}
  if (!opts.minimal) {
    devDeps['@types/react'] = depVer('@types/react')
    devDeps['@types/react-dom'] = depVer('@types/react-dom')
  }
  devDeps['@types/node'] = depVer('@types/node')

  await writeFile(join(targetDir, 'package.json'), JSON.stringify({
    name,
    type: 'module',
    scripts: {
      dev: 'NODE_ENV=development node --watch index.ts',
      start: 'node index.ts',
    },
    dependencies: deps,
    devDependencies: devDeps,
  }, null, 2) + '\n')

  // Write tsconfig.json
  const include = opts.minimal ? ['*.ts'] : ['*.ts', 'ui/**/*.ts', 'ui/**/*.tsx']
  await writeFile(join(targetDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ESNext',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      jsx: 'react-jsx',
      skipLibCheck: true,
      noEmit: true,
      allowImportingTsExtensions: true,
    },
    include,
  }, null, 2) + '\n')

  await writeFile(join(targetDir, '.gitignore'), 'node_modules\ndist\n.env\n.sessions\n.weifuwu\n')
  await writeFile(join(targetDir, '.env'), 'PORT=3000\n')
  await writeFile(join(targetDir, 'AGENTS.md'), [
    `# ${name}`,
    '',
    `This is a [weifuwu](https://weifuwu.io) application — pure Node.js, no build step.`,
    '',
    '## Commands',
    '',
    '- `npm run dev` — start dev server with hot reload',
    '- `npm start` — start production server',
    '- `npm install` — install dependencies',
    '- `npx tsc --noEmit` — type-check',
    '',
    '## API Reference',
    '',
    'See `node_modules/weifuwu/README.md` for the full documentation.',
    '',
  ].join('\n'))

  if (!opts.skipInstall) {
    console.log('\nInstalling dependencies...')
    execSync('npm install', { cwd: targetDir, stdio: 'inherit' })
  }
  console.log(`\n✅ Created ${name}/ — cd ${name} && ${opts.skipInstall ? 'npm install && ' : ''}npm run dev`)
}

async function cmdDev() {
  const entry = existsSync('index.ts') ? 'index.ts'
    : existsSync('app.ts') ? 'app.ts'
    : null

  if (!entry) {
    console.error('No index.ts or app.ts found in current directory.')
    console.error('Run `npx weifuwu init <name>` to create a new project.')
    process.exit(1)
  }

  console.log(`Starting dev server (${entry})...`)
  execSync(`NODE_ENV=development node --watch ${entry}`, { stdio: 'inherit' })
}

async function cmdGenerate(type: string, name: string) {
  if (type !== 'module') {
    console.error(`Unknown generate type: ${type}. Usage: npx weifuwu generate module <name>`)
    process.exit(1)
  }

  const dir = join(process.cwd(), name)
  if (existsSync(dir)) {
    console.error(`Directory ${name} already exists.`)
    process.exit(1)
  }

  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'index.ts'), [
    `import type { Middleware } from 'weifuwu'`,
    ``,
    `export interface ${capitalize(name)}Options {`,
    `  // Add your options here`,
    `}`,
    ``,
    `export function ${name}(opts?: ${capitalize(name)}Options): Middleware {`,
    `  return async (req, ctx, next) => {`,
    `    // Your middleware logic here`,
    `    return next(req, ctx)`,
    `  }`,
    `}`,
    ``,
  ].join('\n'))

  await mkdir(join(dir, '..', 'test'), { recursive: true })
  await writeFile(join(dir, '..', 'test', `${name}.test.ts`), [
    `import { describe, it } from 'node:test'`,
    `import assert from 'node:assert/strict'`,
    `import { ${name} } from '../${name}/index.ts'`,
    `import { Router } from 'weifuwu'`,
    ``,
    `describe('${name}', () => {`,
    `  it('works as middleware', async () => {`,
    `    const app = new Router()`,
    `    app.use(${name}())`,
    `    app.get('/', () => new Response('ok'))`,
    ``,
    `    const res = await app.handler()(`,
    `      new Request('http://localhost/'),`,
    `      { params: {}, query: {} } as any,`,
    `    )`,
    `    assert.equal(res.status, 200)`,
    `  })`,
    `})`,
    ``,
  ].join('\n'))

  console.log(`✅ Created module ${name}/ with index.ts and test/${name}.test.ts`)
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Minimal rm -rf
async function rmrf(dir: string) {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) {
        await rmrf(p)
      } else {
        const { unlink } = await import('node:fs/promises')
        await unlink(p)
      }
    }
    const { rmdir } = await import('node:fs/promises')
    await rmdir(dir)
  } catch { /* ignore */ }
}

// ── CLI dispatcher ──────────────────────────────────────────────────────

const cmd = process.argv[2]

const HELP = `
weifuwu — Web-standard HTTP framework for Node.js

Usage:
  npx weifuwu init <name>            Create a new project (SSR + i18n + theme)
  npx weifuwu init <name> --minimal  Create a minimal HTTP project
  npx weifuwu dev                     Start dev server in current directory
  npx weifuwu generate module <name>  Scaffold a new module
  npx weifuwu version                 Print version
`

if (cmd === 'version' || cmd === '-v' || cmd === '--version') {
  cmdVersion().catch(console.error)
} else if (cmd === 'skill') {
  cmdSkill().catch(console.error)
} else if (cmd === 'init') {
  const name = process.argv[3]
  if (!name) {
    console.error('Usage: npx weifuwu init <name> [--minimal]')
    process.exit(1)
  }
  const minimal = process.argv.includes('--minimal')
  const skipInstall = process.argv.includes('--skip-install')
  cmdInit(name, { minimal, skipInstall }).catch(console.error)
} else if (cmd === 'dev') {
  cmdDev()
} else if (cmd === 'generate' || cmd === 'g') {
  const type = process.argv[3]
  const name = process.argv[4]
  if (!type || !name) {
    console.error('Usage: npx weifuwu generate module <name>')
    process.exit(1)
  }
  cmdGenerate(type, name).catch(console.error)
} else {
  console.log(HELP)
}
