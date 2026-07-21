#!/usr/bin/env node
/**
 * agent-platform 构建脚本
 *
 * 构建前端 SPA bundle 输出到 dist/
 */

import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cp, mkdir } from 'node:fs/promises'

const dir = dirname(fileURLToPath(import.meta.url))
const root = join(dir, '..')
const dist = join(root, 'dist')

await mkdir(dist, { recursive: true })

// 构建前端 bundle
await esbuild.build({
  entryPoints: [join(root, 'ui', 'main.tsx')],
  outfile: join(dist, 'app.js'),
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
  format: 'esm',
  platform: 'browser',
})

// 复制 HTML
const htmlPath = join(root, 'public', 'index.html')
try {
  await cp(htmlPath, join(dist, 'index.html'))
} catch {
  // 如果没有 index.html 模板，生成一个默认的
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Platform</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>`
  await import('node:fs/promises').then(fs => fs.writeFile(join(dist, 'index.html'), html))
}

console.log('[agent-platform] build complete.')
