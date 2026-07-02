/* eslint-disable no-console */
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkgRoot = resolve(__dirname, '..')

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

async function cmdInit(name: string, opts: { skipInstall?: boolean; ssr?: boolean; ui?: boolean }) {
  const targetDir = resolve(process.cwd(), name)

  if (existsSync(targetDir)) {
    console.error(`Directory ${name} already exists.`)
    process.exit(1)
  }

  const pkg = await readPkg()
  const typesNodeVersion = pkg.devDependencies?.['@types/node'] || '^22'

  if (opts.ssr) {
    await generateReactSsr(targetDir, name, pkg.version, typesNodeVersion, opts.skipInstall)
  } else if (opts.ui) {
    await generateUi(targetDir, name, pkg.version, typesNodeVersion, opts.skipInstall)
  } else {
    await generateMinimal(targetDir, name, pkg.version, typesNodeVersion, opts.skipInstall)
  }
}

// ── Minimal (API-only) project ─────────────────────────────────────────

async function generateMinimal(
  targetDir: string,
  name: string,
  version: string,
  typesNodeVersion: string,
  skipInstall?: boolean,
) {
  await mkdir(targetDir, { recursive: true })

  await writeFile(
    join(targetDir, 'app.ts'),
    [
      `import { Router } from '@weifuwujs/core'`,
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
      `import { loadEnv, serve } from '@weifuwujs/core'`,
      `import { app } from './app.ts'`,
      ``,
      `loadEnv()`,
      `const port = Number(process.env.PORT) || 3000`,
      `serve(app.handler(), { port })`,
      ``,
    ].join('\n'),
  )

  await writePackageJson(targetDir, name, version, typesNodeVersion, {})
  await writeCommonFiles(targetDir)
  await finishInit(targetDir, skipInstall)
}

// ── React SSR project ────────────────────────────────────────────────

async function generateReactSsr(
  targetDir: string,
  name: string,
  version: string,
  typesNodeVersion: string,
  skipInstall?: boolean,
) {
  await mkdir(targetDir, { recursive: true })
  const templateDir = join(__dirname, 'cli', 'template', 'react')
  await copyRecursive(templateDir, targetDir)

  await writePackageJson(targetDir, name, version, typesNodeVersion, {
    dependencies: {
      '@weifuwujs/react': '^0.28.0',
      react: '^19',
      'react-dom': '^19',
      '@tailwindcss/postcss': '^4',
      tailwindcss: '^4',
      postcss: '^8',
    },
    devDependencies: {
      '@types/react': '^19',
      '@types/react-dom': '^19',
      esbuild: '^0.28',
    },
  })

  await writeFile(join(targetDir, '.gitignore'), 'node_modules\n.env\n.weifuwu\n')
  await finishInit(targetDir, skipInstall)
}

async function copyRecursive(src: string, dest: string) {
  const { readdir, copyFile } = await import('node:fs/promises')
  const entries = await readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = join(src, entry.name)
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true })
      await copyRecursive(srcPath, destPath)
    } else if (entry.isFile()) {
      await copyFile(srcPath, destPath)
    }
  }
}

// ── UI (h() + Signal) project ───────────────────────────────────────────

async function generateUi(
  targetDir: string,
  name: string,
  version: string,
  typesNodeVersion: string,
  skipInstall?: boolean,
) {
  await mkdir(targetDir, { recursive: true })
  const templateDir = join(__dirname, 'cli', 'template', 'ui')
  await copyRecursive(templateDir, targetDir)

  await writePackageJson(targetDir, name, version, typesNodeVersion, {
    dependencies: {
      '@weifuwu/ui': '^0.28.0',
    },
  })

  await finishInit(targetDir, skipInstall)
}

// ── Shared helpers ─────────────────────────────────────────────────────

async function writePackageJson(
  targetDir: string,
  name: string,
  version: string,
  typesNodeVersion: string,
  extra?: Record<string, unknown>,
) {
  const deps: Record<string, string> = {}
  // Pin core to the current major.minor series that the CLI was built with.
  // This avoids version mismatch when CLI patches are published independently of core.
  deps['@weifuwujs/core'] = '^0.28.0'
  if (extra?.dependencies) {
    Object.assign(deps, extra.dependencies as Record<string, string>)
  }

  const devDeps: Record<string, string> = { '@types/node': typesNodeVersion }
  if (extra?.devDependencies) {
    Object.assign(devDeps, extra.devDependencies as Record<string, string>)
  }

  const pkg: Record<string, unknown> = {
    name,
    type: 'module',
    scripts: {
      dev: 'node --watch index.ts',
      start: 'node index.ts',
    },
    dependencies: deps,
    devDependencies: devDeps,
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
  npm create weifuwu <name>              Create a new API project
  npm create weifuwu <name> --ui         Create a h() + Signal UI project
  npm create weifuwu <name> --ssr        Create a React SSR project
  npm create weifuwu <name> --skip-install  Skip npm install
  npx create-weifuwu version             Print version
`

if (cmd === 'version' || cmd === '-v' || cmd === '--version') {
  cmdVersion().catch(console.error)
} else if (cmd === 'init' || (cmd && !cmd.startsWith('-'))) {
  // Support both:
  //   npx create-weifuwu init my-app        ← explicit
  //   npx create-weifuwu my-app              ← implicit (npm create weifuwu)
  const args = cmd === 'init' ? process.argv.slice(3) : process.argv.slice(2)
  const { values, positionals } = parseArgs({
    args,
    options: {
      'skip-install': { type: 'boolean' },
      'ssr': { type: 'boolean' },
      'react': { type: 'boolean' },
      'ui': { type: 'boolean' },
    },
    strict: false,
    allowPositionals: true,
  })
  const name = positionals.find(a => !a.startsWith('-'))
  if (!name) {
    console.error('Usage: npx create-weifuwu <name> [--ui|--ssr] [--skip-install]')
    process.exit(1)
  }
  cmdInit(name, {
    skipInstall: !!values['skip-install'],
    ssr: !!(values['ssr'] || values['react']),
    ui: !!values['ui'],
  }).catch(
    console.error,
  )
} else {
  console.log(HELP)
}
