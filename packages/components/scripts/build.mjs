#!/usr/bin/env node
import esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  external: ['weifuwu', 'weifuwu/client'],
  logLevel: 'info',
})
