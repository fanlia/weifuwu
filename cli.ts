#!/usr/bin/env node
import { mkdir, writeFile, copyFile, readFile, cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkgRoot = existsSync(join(__dirname, 'package.json')) ? __dirname : resolve(__dirname, '..')

async function cmdSkill() {
  const targetDir = join(homedir(), '.agents', 'skills', 'weifuwu')
  await mkdir(targetDir, { recursive: true })
  await copyFile(join(pkgRoot, 'README.md'), join(targetDir, 'SKILL.md'))
  console.log('✅ Installed weifuwu skill to ~/.agents/skills/weifuwu/')
}

async function cmdVersion() {
  const pkg = JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf-8'))
  console.log(pkg.version)
}

async function cmdInit(name: string) {
  const targetDir = resolve(process.cwd(), name)
  const pkg = JSON.parse(await readFile(join(pkgRoot, 'package.json'), 'utf-8'))
  const v = pkg.version
  const depVer = (depName: string) => `^${pkg.devDependencies[depName].replace(/^\^/, '')}`

  await mkdir(targetDir, { recursive: true })

  // Copy code templates
  const templateDir = join(pkgRoot, 'cli', 'template')
  await cp(templateDir, targetDir, { recursive: true })

  // Rewrite local imports → package imports for the copied project
  for (const file of ['app.ts', 'index.ts', 'ui/page.tsx']) {
    const fp = join(targetDir, file)
    let content = await readFile(fp, 'utf-8')
    content = content
      .replace(/from '\.\.\/\.\.\/index\.ts'/g, "from 'weifuwu'")
      .replace(/from '\.\.\/\.\.\/\.\.\/react\.ts'/g, "from 'weifuwu/react'")
    await writeFile(fp, content)
  }

  // Write config files
  await writeFile(join(targetDir, 'package.json'), JSON.stringify({
    name,
    type: 'module',
    scripts: {
      dev: 'NODE_ENV=development node index.ts',
      start: 'node index.ts',
    },
    dependencies: {
      weifuwu: `^${v}`,
    },
    devDependencies: {
      '@types/node': depVer('@types/node'),
      '@types/react': depVer('@types/react'),
    },
  }, null, 2) + '\n')

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
    include: ['*.ts', 'ui/**/*.ts', 'ui/**/*.tsx'],
  }, null, 2) + '\n')

  await writeFile(join(targetDir, '.gitignore'), 'node_modules\ndist\n.env\n.sessions\n.weifuwu\n')
  await writeFile(join(targetDir, '.env'), 'PORT=3000\n')

  await writeFile(join(targetDir, 'AGENTS.md'), [
    `# ${name}`,
    '',
    'This is a [weifuwu](https://weifuwu.io) HTTP application — pure Node.js, no build step.',
    '',
    '## Before you start',
    '',
    'Read `node_modules/weifuwu/README.md` first.',
    '',
    '## Commands',
    '',
    '- `npm run dev` — start dev server with `--watch`',
    '- `npm start` — start production server',
    '- `npm install` — install dependencies',
    '- `npx tsc --noEmit` — type-check without emitting',
    '',
    '## API Reference',
    '',
    'See `node_modules/weifuwu/README.md` for the full weifuwu API documentation.',
    '',
  ].join('\n'))

  console.log('\nInstalling dependencies...')
  execSync('npm install', { cwd: targetDir, stdio: 'inherit' })
  console.log(`\n✅ Created ${name}/ — cd ${name} && npm start`)
}

const cmd = process.argv[2]

if (cmd === 'version' || cmd === '-v' || cmd === '--version') {
  cmdVersion().catch(console.error)
} else if (cmd === 'skill') {
  cmdSkill().catch(console.error)
} else if (cmd === 'init') {
  const name = process.argv[3]
  if (!name) {
    console.error('Usage: npx weifuwu init <name>')
    process.exit(1)
  }
  cmdInit(name).catch(console.error)
} else {
  console.log('\nUsage:\n  npx weifuwu version          Print version\n  npx weifuwu init <name>    Create a new weifuwu project\n  npx weifuwu skill           Install weifuwu skill to ~/.agents/skills/\n')
}
