#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

import { cp, rm } from 'node:fs/promises'

// Clean dist first to avoid stale files
await rm(join(root, 'dist'), { recursive: true, force: true })

await esbuild.build({
  entryPoints: [join(root, 'src', 'cli.ts')],
  outfile: join(root, 'dist', 'cli.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  banner: { js: '#!/usr/bin/env node' },
})

// Copy template files for runtime use
await cp(join(root, 'src', 'cli', 'template'), join(root, 'dist', 'cli', 'template'), { recursive: true })
