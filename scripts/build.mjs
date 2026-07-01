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
  'alpinejs',
  'graphql',
  'htmx.org',
  'ioredis',
  'postcss',
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

// Copy template directory into dist for npm publish
const srcTemplate = join(root, 'cli', 'template')
const dstTemplate = join(root, 'dist', 'template')
rmSync(dstTemplate, { recursive: true, force: true })
cpSync(srcTemplate, dstTemplate, { recursive: true })
console.log('  ✓ template copied to dist/template/')
