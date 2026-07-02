/**
 * Build client-side bundle.
 *
 * Usage: node build.mjs
 * Output: public/client.js
 *
 * This bundles the client hydration entry for browser consumption.
 */
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

await esbuild.build({
  entryPoints: [join(__dirname, 'client.ts')],
  outfile: join(__dirname, 'public', 'client.js'),
  format: 'esm',
  platform: 'browser',
  bundle: true,
  external: ['react', 'react-dom', 'react-dom/client'],
  minify: true,
})

console.log('Client bundle built → public/client.js')
