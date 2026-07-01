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

async function cmdInit(name: string, opts: { skipInstall?: boolean; minimal?: boolean }) {
  const targetDir = resolve(process.cwd(), name)

  if (existsSync(targetDir)) {
    console.error(`Directory ${name} already exists.`)
    process.exit(1)
  }

  const pkg = await readPkg()

  if (opts.minimal) {
    await generateMinimal(targetDir, name, pkg.version, opts.skipInstall)
  } else {
    await generateFull(targetDir, name, pkg.version, opts.skipInstall)
  }
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

// ── Full (SSR + UI) project ────────────────────────────────────────────

async function generateFull(
  targetDir: string,
  name: string,
  version: string,
  skipInstall?: boolean,
) {
  await mkdir(targetDir, { recursive: true })
  await mkdir(join(targetDir, 'ui', 'app'), { recursive: true })

  await mkdir(join(targetDir, 'ui', 'lib'), { recursive: true })
  await mkdir(join(targetDir, 'locales'), { recursive: true })

  // ── app.ts — Router setup ──────────────────────────────────────────
  await writeFile(
    join(targetDir, 'app.ts'),
    [
      `import { Router, layout, view, theme, i18n, cssContext, cssRouter, assetRouter } from 'weifuwu'`,
      ``,
      `export const app = new Router()`,
      ``,
      `// Middleware`,
      `app.use(theme())`,
      `app.use(i18n({ dir: './locales' }))`,
      `app.use(cssContext('./ui'))`,
      ``,
      `// Layout — wraps all pages`,
      `app.use(layout('./ui/app/layout.ts'))`,
      ``,
      `// Static assets (HTMX, Alpine)`,
      `app.use(assetRouter())`,
      ``,
      `// CSS serving`,
      `app.use('/', cssRouter('./ui'))`,
      ``,
      `// Pages`,
      `app.get('/', view('./ui/app/page.ts'))`,
      ``,
      `// API route`,
      `app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))`,
      ``,
    ].join('\n'),
  )

  // ── index.ts — Entry point ─────────────────────────────────────────
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

  // ── ui/app/globals.css — Tailwind v4 ──────────────────────────────
  await writeFile(
    join(targetDir, 'ui', 'app', 'globals.css'),
    [`@import "tailwindcss";`, `@custom-variant dark (&:is(.dark *));`, ``].join('\n'),
  )

  // ── ui/app/layout.ts — Root layout ────────────────────────────────
  await writeFile(
    join(targetDir, 'ui', 'app', 'layout.ts'),
    [
      `import { html, raw, assetScripts } from 'weifuwu'`,
      ``,
      `export default function(body: string, ctx: any) {`,
      `  // Theme: resolve before paint to prevent flash`,
      `  const themeScript = raw(\`<script>`,
      `!function(){`,
      `var t=(document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/)||[])[1]||'system';`,
      `if(t==='system')t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';`,
      `document.documentElement.classList.toggle('dark',t==='dark');`,
      `}()`,
      `</script>\`)`,
      ``,
      `  // i18n: set lang attribute`,
      `  const lang = ctx.i18n?.locale || 'en'`,
      ``,
      `  // CSS: include compiled stylesheet`,
      `  const cssLink = ctx.css?.url`,
      `    ? raw(\`<link rel="stylesheet" href="\${ctx.css.url}">\`)`,
      `    : ''`,
      ``,
      `  return html\`<!DOCTYPE html>`,
      `<html lang="\${lang}">`,
      `<head>`,
      `  <meta charset="utf-8" />`,
      `  <meta name="viewport" content="width=device-width, initial-scale=1" />`,
      `  \${themeScript}`,
      `  \${assetScripts()}`,
      `  \${cssLink}`,
      `</head>`,
      `<body class="min-h-screen bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">`,
      `  \${raw(body)}`,
      `</body>`,
      `</html>\``,
      `}`,
      ``,
    ].join('\n'),
  )

  // ── ui/app/page.ts — Home page ────────────────────────────────────
  await writeFile(
    join(targetDir, 'ui', 'app', 'page.ts'),
    [
      `import { html } from 'weifuwu'`,
      ``,
      `export default function(ctx: any) {`,
      `  const t = ctx.i18n?.t || ((k: string) => k)`,
      `  const theme = ctx.theme?.value || 'system'`,
      `  const locale = ctx.i18n?.locale || 'en'`,
      ``,
      `  return html\`<div x-data="{ open: false }" class="min-h-screen">`,
      `    <!-- Navbar -->`,
      `    <nav class="border-b border-gray-200 dark:border-gray-800">`,
      `      <div class="max-w-5xl mx-auto flex items-center justify-between h-14 px-4">`,
      `        <span class="font-bold text-lg">weifuwu</span>`,
      `        <div class="flex items-center gap-3 text-sm">`,
      `          <!-- Locale toggle -->`,
      `          <a href="/__lang/\${locale === 'en' ? 'zh-CN' : 'en'}"`,
      `             class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600`,
      `                    hover:bg-gray-100 dark:hover:bg-gray-800 transition">`,
      `            \${locale === 'en' ? '中文' : 'EN'}`,
      `          </a>`,
      `          <!-- Theme toggle -->`,
      `          <a href="/__theme/\${theme === 'dark' ? 'light' : 'dark'}"`,
      `             class="px-2 py-1 rounded border border-gray-300 dark:border-gray-600`,
      `                    hover:bg-gray-100 dark:hover:bg-gray-800 transition">`,
      `            \${theme === 'dark' ? '☀️' : '🌙'}`,
      `          </a>`,
      `        </div>`,
      `      </div>`,
      `    </nav>`,
      ``,
      `    <!-- Hero -->`,
      `    <section class="max-w-3xl mx-auto px-4 py-16 text-center">`,
      `      <h1 class="text-4xl font-bold tracking-tight mb-3">\${t('hero.title')}</h1>`,
      `      <p class="text-gray-500 dark:text-gray-400 text-lg mb-8">`,
      `        Pure Node.js, no build step`,
      `      </p>`,
      ``,
      `      <div class="flex justify-center gap-3">`,
      `        <button @click="open = !open"`,
      `                class="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white`,
      `                       hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-300">`,
      `          \${t('hero.cta')}`,
      `        </button>`,
      `        <a href="/docs"`,
      `           class="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium`,
      `                  hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800">`,
      `          \${t('hero.docs')}`,
      `        </a>`,
      `      </div>`,
      ``,
      `      <!-- Alpine demo: click to reveal -->`,
      `      <div x-show="open" x-cloak`,
      `           class="mt-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-left">`,
      `        \${t('demo.alpine')}`,
      `      </div>`,
      `    </section>`,
      `  </div>\``,
      `}`,
      ``,
    ].join('\n'),
  )

  // ── ui/lib/utils.ts — cn() utility ────────────────────────────────
  await writeFile(
    join(targetDir, 'ui', 'lib', 'utils.ts'),
    [
      `/**`,
      ` * cn() — Merge class names, handling conditional and array inputs.`,
      ` * Lightweight alternative to clsx + tailwind-merge.`,
      ` */`,
      `export function cn(...classes: (string | false | null | undefined)[]): string {`,
      `  return classes.filter(Boolean).join(' ')`,
      `}`,
      ``,
    ].join('\n'),
  )

  // ── i18n locales ──────────────────────────────────────────────────
  await writeFile(
    join(targetDir, 'locales', 'en.json'),
    JSON.stringify(
      {
        'hero.title': 'Build APIs & UI, Zero Build Step',
        'hero.cta': 'Try Alpine',
        'hero.docs': 'Documentation',
        'demo.alpine':
          'This is Alpine.js in action — click-toggled content, zero JavaScript written.',
      },
      null,
      2,
    ) + '\n',
  )

  await writeFile(
    join(targetDir, 'locales', 'zh-CN.json'),
    JSON.stringify(
      {
        'hero.title': '零编译构建 API 和 UI',
        'hero.cta': '体验 Alpine',
        'hero.docs': '文档',
        'demo.alpine': '这是 Alpine.js 的演示——点击切换内容，不需要写 JavaScript。',
      },
      null,
      2,
    ) + '\n',
  )

  // ── package.json ──────────────────────────────────────────────────
  await writePackageJson(targetDir, name, version, {
    dependencies: {
      weifuwu: `^${version}`,
    },
    devDependencies: {},
  })

  // ── tsconfig.json ─────────────────────────────────────────────────
  await writeFile(
    join(targetDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          allowImportingTsExtensions: true,
          paths: {
            '@/*': ['./ui/*'],
          },
        },
        include: ['*.ts', 'ui/**/*.ts'],
      },
      null,
      2,
    ) + '\n',
  )

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
  npx weifuwu init <name>               Create a new project (SSR + shadcn UI)
  npx weifuwu init <name> --minimal     Create a minimal API-only project
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
      minimal: { type: 'boolean' },
    },
    strict: false,
    allowPositionals: true,
  })
  const name = positionals[0]
  if (!name) {
    console.error('Usage: npx weifuwu init <name> [--skip-install] [--minimal]')
    process.exit(1)
  }
  cmdInit(name, { skipInstall: !!values['skip-install'], minimal: !!values['minimal'] }).catch(
    console.error,
  )
} else {
  console.log(HELP)
}
