#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const external = [
  '@ai-sdk/openai',
  '@graphql-tools/schema',
  'ai',
  'graphql',
  'ioredis',
  'postgres',
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

// Copy dist-only assets (none currently)
