/**
 * Build client-side bundle for production.
 *
 * Bundles react + react-dom into client.js — no import map needed at runtime.
 *
 * Usage: node build.mjs
 * Output: public/client.js
 */

import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir } from 'node:fs/promises'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outdir = join(__dirname, 'public')

await mkdir(outdir, { recursive: true })

await esbuild.build({
  entryPoints: [join(__dirname, 'client.ts')],
  outfile: join(outdir, 'client.js'),
  format: 'esm',
  platform: 'browser',
  bundle: true,
  minify: true,
})

console.log('✅ public/client.js built')
