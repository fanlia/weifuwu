#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const srcDir = join(root, 'src')
const distDir = join(root, 'dist')

await mkdir(distDir, { recursive: true })

const external = [
  '@graphql-tools/schema',
  'graphql',
  'ioredis',
  'postgres',
  'ws',
  'zod',
]

await esbuild.build({
  entryPoints: [join(srcDir, 'index.ts')],
  outfile: join(distDir, 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

console.log('Build complete.')
