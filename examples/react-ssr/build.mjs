/**
 * Build client-side bundles for production.
 *
 * vendor.js — react + react-dom (rarely changes, browser-cached)
 * client.js — app code only (changes frequently, small)
 *
 * For development, esbuildDev middleware in server.ts handles auto-compilation.
 * Use this for production pre-build: node build.mjs → output to public/
 *
 * Usage: node build.mjs
 * Output: public/vendor.js, public/client.js
 */

import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outdir = join(__dirname, 'public')

await mkdir(outdir, { recursive: true })

// Vendor bundle — react + react-dom (cache-friendly)
await esbuild.build({
  entryPoints: [join(__dirname, 'vendor.ts')],
  outfile: join(outdir, 'vendor.js'),
  format: 'esm',
  platform: 'browser',
  bundle: true,
  minify: true,
})

// App bundle — business logic only (small, changes often)
await esbuild.build({
  entryPoints: [join(__dirname, 'client.ts')],
  outfile: join(outdir, 'client.js'),
  format: 'esm',
  platform: 'browser',
  bundle: true,
  external: ['react', 'react-dom/client', 'react/jsx-runtime'],
  minify: true,
})

console.log('✅ public/vendor.js + public/client.js built')
