#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const srcDir = join(root, 'src')

const external = [
  '@ai-sdk/openai',
  '@graphql-tools/schema',
  '@tailwindcss/postcss',
  '@tailwindcss/oxide*',
  'ai',
  'graphql',
  'ioredis',
  'lightningcss*',
  'postcss',
  'postcss-nesting',
  'postgres',
  'ws',
  'zod',
]

await esbuild.build({
  entryPoints: [join(srcDir, 'index.ts')],
  outfile: join(root, 'dist', 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

// Copy dist-only assets (none currently)
