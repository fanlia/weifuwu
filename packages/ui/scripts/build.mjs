#!/usr/bin/env node
import esbuild from 'esbuild'
import { execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir } from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = join(__dirname, '..')
const src = join(root, 'src')
const dist = join(root, 'dist')

await mkdir(dist, { recursive: true })

// ── Server middleware (for Node.js) ──
await esbuild.build({
  entryPoints: [join(src, 'index.ts')],
  outfile: join(dist, 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external: [
    '@weifuwujs/core',     // peer dependency
    'node:fs/promises',
    'node:path',
    'node:url',
  ],
})

// ── Client runtime (for browser, IIFE) ──
await esbuild.build({
  entryPoints: [join(src, 'weifuwu-ui.ts')],
  outfile: join(dist, 'weifuwu-ui.js'),
  format: 'iife',
  globalName: 'weifuwu',
  platform: 'browser',
  bundle: true,
  minify: true,
})

// ── Type declarations ──
execSync('npx tsc --project tsconfig.json --outDir dist', {
  cwd: root,
  stdio: 'inherit',
})

// ── Copy CSS (if exists) ──
try {
  await cp(join(src, 'weifuwu-ui.css'), join(dist, 'weifuwu-ui.css'))
} catch {
  // CSS is optional
}
