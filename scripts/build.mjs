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

const external = [
  '@graphql-tools/schema',
  'graphql',
  'ioredis',
  'postgres',
  'ws',
  'react',
  'react-dom',
  'react-dom/server',
  'react-dom/client',
]

await esbuild.build({
  entryPoints: [join(srcDir, 'index.ts')],
  outfile: join(distDir, 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

// React SSR module — separate entry point
await esbuild.build({
  entryPoints: [join(srcDir, 'react/index.ts')],
  outfile: join(distDir, 'react/index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

// React navigation — shared primitives (safe for server & client)
await esbuild.build({
  entryPoints: [join(srcDir, 'react/navigation.ts')],
  outfile: join(distDir, 'react/navigation.js'),
  format: 'esm',
  platform: 'neutral',
  bundle: true,
  external: ['react'],
})

// React client — separate entry point (for browser bundles)
await esbuild.build({
  entryPoints: [join(srcDir, 'react/client.ts')],
  outfile: join(distDir, 'react/client.js'),
  format: 'esm',
  platform: 'browser',
  bundle: true,
  external: ['react', 'react-dom', 'react-dom/client'],
})

console.log('Build complete.')
