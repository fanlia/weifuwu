#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'
import { rm } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const srcDir = join(root, 'src')
const distDir = join(root, 'dist')

// Clean stale dist
await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })
await mkdir(join(distDir, 'client'), { recursive: true })


const external = [
  '@graphql-tools/schema',
  'graphql',
  'ioredis',
  'postgres',
  'ws',
  'esbuild',
  'postcss',
  'tailwindcss',
  '@tailwindcss/postcss',
]

// 后端 bundle
await esbuild.build({
  entryPoints: [join(srcDir, 'index.ts')],
  outfile: join(distDir, 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

// 前端 bundle
await esbuild.build({
  entryPoints: [join(srcDir, 'client', 'index.ts')],
  outfile: join(distDir, 'client', 'index.js'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
})

// jsx-runtime re-exports from client/index.js via package.json exports

console.log('Build complete.')
