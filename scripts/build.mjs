#!/usr/bin/env node
import esbuild from 'esbuild'
import { cpSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const external = [
  '@ai-sdk/openai',
  '@graphql-tools/schema',
  '@tailwindcss/postcss',
  'ai',
  'graphql',
  'ioredis',
  'postcss',
  'postcss-nesting',
  'postgres',
  'tailwindcss',
  'ws',
  'zod',
]

await Promise.all([
  esbuild.build({
    entryPoints: ['index.ts'],
    outfile: 'dist/index.js',
    format: 'esm',
    platform: 'node',
    bundle: true,
    external,
  }),
  esbuild.build({
    entryPoints: ['cli.ts'],
    outfile: 'dist/cli.js',
    format: 'esm',
    platform: 'node',
    bundle: true,
    external,
  }),
])

// Copy weifuwu-ui static files to dist for npm publish
const uiDir = join(root, 'ssr', 'ui')
const distDir = join(root, 'dist')
cpSync(join(uiDir, 'weifuwu-ui.js'), join(distDir, 'weifuwu-ui.js'))
cpSync(join(uiDir, 'weifuwu-ui.css'), join(distDir, 'weifuwu-ui.css'))
console.log('  ✓ weifuwu-ui files copied to dist/')

// Copy weifuwu-ui docs to dist for npm publish
cpSync(join(root, 'docs', 'ssr', 'ui.md'), join(root, 'dist', 'docs', 'ssr', 'ui.md'))
console.log('  ✓ weifuwu-ui docs copied to dist/')

// Copy template directory into dist for npm publish
const srcTemplate = join(root, 'cli', 'template')
const dstTemplate = join(root, 'dist', 'template')
rmSync(dstTemplate, { recursive: true, force: true })
cpSync(srcTemplate, dstTemplate, { recursive: true })
console.log('  ✓ template copied to dist/template/')
