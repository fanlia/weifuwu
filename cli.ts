#!/usr/bin/env node
import { mkdir, writeFile, copyFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkgRoot = resolve(__dirname, '..')

async function cmdSkill() {
  const targetDir = join(homedir(), '.agents', 'skills', 'weifuwu')
  await mkdir(targetDir, { recursive: true })
  await copyFile(join(pkgRoot, 'README.md'), join(targetDir, 'SKILL.md'))
  console.log('✅ Installed weifuwu skill to ~/.agents/skills/weifuwu/')
}

async function cmdInit(name: string) {
  const targetDir = resolve(process.cwd(), name)
  await mkdir(targetDir, { recursive: true })

  await writeFile(join(targetDir, 'package.json'), JSON.stringify({
    name,
    type: 'module',
    scripts: {
      dev: 'node --watch app.ts',
      start: 'node app.ts',
    },
    dependencies: {
      weifuwu: 'latest',
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
    },
    include: ['*.ts'],
  }, null, 2) + '\n')

  await writeFile(join(targetDir, '.gitignore'), 'node_modules\ndist\n.env\n.sessions\n')

  await writeFile(join(targetDir, '.env'), 'PORT=3000\n')

  await writeFile(join(targetDir, 'app.ts'), [
    "import { serve, Router, loadEnv } from 'weifuwu'",
    '',
    "loadEnv()",
    "const port = Number(process.env.PORT) || 3000",
    '',
    "const app = new Router()",
    "app.get('/', (req, ctx) => new Response('Hello, Weifuwu!'))",
    '',
    "serve(app.handler(), { port })",
    "console.log(`Listening on http://localhost:${port}`)",
    '',
  ].join('\n'))

  console.log(`✅ Created ${name}/ — cd ${name} && npm install && npm run dev`)
}

const cmd = process.argv[2]

if (cmd === 'skill') {
  cmdSkill().catch(console.error)
} else if (cmd === 'init') {
  const name = process.argv[3]
  if (!name) {
    console.error('Usage: npx weifuwu init <name>')
    process.exit(1)
  }
  cmdInit(name).catch(console.error)
} else {
  console.log('\nUsage:\n  npx weifuwu init <name>    Create a new weifuwu project\n  npx weifuwu skill           Install weifuwu skill to ~/.agents/skills/\n')
}
