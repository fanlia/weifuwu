#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir } from 'node:fs/promises'

const dir = dirname(fileURLToPath(import.meta.url))
const root = join(dir, '..')
const dist = join(root, 'dist')

await mkdir(dist, { recursive: true })

// 构建前端 bundle
await esbuild.build({
  entryPoints: [join(root, 'src', 'main.tsx')],
  outfile: join(dist, 'app.js'),
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
  format: 'esm',
})

// 复制 HTML
await cp(join(root, 'public', 'index.html'), join(dist, 'index.html'))

console.log('demo build complete.')
