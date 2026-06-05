#!/usr/bin/env node
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
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
    include: ['*.ts', 'ui/**/*.ts', 'ui/**/*.tsx'],
  }, null, 2) + '\n')

  await writeFile(join(targetDir, '.gitignore'), 'node_modules\ndist\n.env\n.sessions\n')

  await writeFile(join(targetDir, '.env'), 'PORT=3000\n')

  await writeFile(join(targetDir, 'AGENTS.md'), [
    `# ${name}`,
    '',
    'This is a [weifuwu](https://weifuwu.io) HTTP application — pure Node.js, no build step.',
    '',
    '## Commands',
    '',
    '- `npm run dev` — start dev server with `--watch`',
    '- `npm start` — start production server',
    '- `npm install` — install dependencies',
    '- `node --test` — run tests',
    '',
    '## TypeScript',
    '',
    '- Node.js v24+ runs TypeScript natively (no build step needed)',
    "- All imports use explicit `.ts` extensions (e.g. `import { x } from './foo.ts'`)",
    '- For JSX/React SSR, use `.tsx` files',
    '',
    '## API Reference',
    '',
    'See `node_modules/weifuwu/README.md` for the full weifuwu API documentation including `serve()`, `Router`, middleware, PostgreSQL, auth, and more.',
    '',
  ].join('\n'))

  await writeFile(join(targetDir, 'app.ts'), [
    "import { serve, Router, loadEnv, tsx } from 'weifuwu'",
    '',
    "loadEnv()",
    "const port = Number(process.env.PORT) || 3000",
    '',
    "const app = new Router()",
    "const ui = await tsx({ dir: './ui/' })",
    "app.use('/', ui)",
    '',
    "app.get('/api/ping', () => Response.json({ pong: true, time: new Date().toISOString() }))",
    '',
    "app.ws('/ws/echo', { message(ws, _ctx, data) { ws.send(`echo: ${data}`) } })",
    '',
    "const server = serve(app.handler(), { port, websocket: app.websocketHandler() })",
    "await server.ready",
    "console.log(`Listening on http://localhost:${server.port}`)",
    '',
  ].join('\n'))

  await mkdir(join(targetDir, 'ui', 'pages'), { recursive: true })

  await writeFile(join(targetDir, 'ui', 'app.css'), '@import "tailwindcss";\n')

  await writeFile(join(targetDir, 'ui', 'pages', 'layout.tsx'), [
    "import { ReactNode } from 'react'",
    '',
    'export default function RootLayout({ children }: { children: ReactNode }) {',
    '  return (',
    '    <html lang="en">',
    '      <head>',
    '        <meta charSet="utf-8" />',
    '        <meta name="viewport" content="width=device-width, initial-scale=1" />',
    '      </head>',
    '      <body>',
    '        <main>{children}</main>',
    '      </body>',
    '    </html>',
    '  )',
    '}',
    '',
  ].join('\n'))

  await writeFile(join(targetDir, 'ui', 'pages', 'page.tsx'), [
    "import { useState } from 'react'",
    "import { useWebsocket } from 'weifuwu'",
    '',
    'export default function Home() {',
    '  const [input, setInput] = useState("")',
    '  const { send, lastMessage, readyState } = useWebsocket("/ws/echo")',
    '',
    '  return (',
    '    <div className="p-8 max-w-xl mx-auto">',
    '      <h1 className="text-3xl font-bold mb-2">Hello, Weifuwu!</h1>',
    '      <p className="text-gray-600 mb-6">',
    '        Welcome to your weifuwu application.',
    '      </p>',
    '      <div className="border rounded-lg p-4 space-y-3">',
    '        <p className="text-sm text-gray-500">',
    '          WebSocket: {readyState === 1 ? "Connected" : readyState === 0 ? "Connecting..." : "Disconnected"}',
    '        </p>',
    '        <div className="flex gap-2">',
    '          <input',
    '            value={input}',
    '            onChange={e => setInput(e.target.value)}',
    '            onKeyDown={e => { if (e.key === "Enter") { send(input); setInput("") } }}',
    '            placeholder="Type a message..."',
    '            className="flex-1 border rounded px-3 py-2 text-sm"',
    '          />',
    '          <button',
    '            onClick={() => { send(input); setInput("") }}',
    '            className="bg-blue-600 text-white px-4 py-2 rounded text-sm"',
    '          >',
    '            Send',
    '          </button>',
    '        </div>',
    '        {lastMessage && (',
    '          <div className="text-sm bg-gray-50 rounded p-2">',
    '            <span className="font-medium">Echo:</span> {lastMessage}',
    '          </div>',
    '        )}',
    '      </div>',
    '    </div>',
    '  )',
    '}',
    '',
  ].join('\n'))

  console.log(`✅ Created ${name}/ — cd ${name} && npm install && npm run dev`)
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
