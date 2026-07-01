#!/usr/bin/env node
import esbuild from 'esbuild'

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
