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
  '@tailwindcss/node',  // dynamic import in tailwindDev
  'esbuild',  // dynamic import in esbuildDev — must be external for native binary
  'tailwindcss',  // dependency of @tailwindcss/node
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

// esbuildDev middleware — lazy-loads esbuild at runtime
await esbuild.build({
  entryPoints: [join(srcDir, 'middleware/esbuild-dev.ts')],
  outfile: join(distDir, 'middleware/esbuild-dev.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external: [...external, 'esbuild'],
})

// tailwindDev middleware — lazy-loads @tailwindcss/node at runtime
await esbuild.build({
  entryPoints: [join(srcDir, 'middleware/tailwind-dev.ts')],
  outfile: join(distDir, 'middleware/tailwind-dev.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external: [...external, '@tailwindcss/node'],
})

console.log('Build complete.')
