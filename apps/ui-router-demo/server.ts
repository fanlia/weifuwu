/**
 * ui-router-demo — ui-dom（独立 UIRouter + VDOM）浏览器冒烟
 *
 * 纯 Node http 静态服务（无 DB / 无 weifuwu 依赖）：
 *   - GET /app.js → esbuild 编译 main.tsx（ui-dom 独立运行时）
 *   - GET /* → index.html
 *
 * 启动: node apps/ui-router-demo/server.ts
 * 验证: http://localhost:3100
 */

import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { ssrPage } from '../../src/ui-dom/ssr.ts'
import { app } from './src/router.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const port = Number(process.env.PORT ?? 3100)

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ui-dom × components demo</title>
  <link rel="stylesheet" href="/components.css">
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 2rem; }
    nav a { margin-right: 1rem; }
    .shell { max-width: 720px; margin: 0 auto; }
    .page { border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-top: 1rem; }
    .err { color: #c00; background: #fee; padding: 1rem; border-radius: 8px; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>`

const server = createServer(async (req, res) => {
  const url = req.url ?? '/'
  if (url === '/components.css') {
    // components 样式（含 Token + 布局原语 + 组件样式）
    res.writeHead(200, { 'Content-Type': 'text/css' })
    res.end(readFileSync(resolve(__dirname, '..', '..', 'dist', 'components', 'style.css'), 'utf8'))
    return
  }
  // SSR：非静态资源请求 → ssrPage 渲染完整 HTML（含 __DATA__）
  if (!url.startsWith('/app.js') && !url.startsWith('/components.css') && url !== '/favicon.ico') {
    try {
      const { page } = await ssrPage(app, { url, styles: ['/components.css'] })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(page)
      return
    } catch (err) {
      console.error('[ui-router-demo] ssr error:', err)
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(String(err))
      return
    }
  }
  if (url === '/app.js') {
    try {
      const result = buildSync({
        entryPoints: [resolve(__dirname, 'src', 'main.tsx')],
        bundle: true,
        format: 'esm',
        platform: 'browser',
        jsx: 'automatic',
        write: false, // 返回 outputFiles（不写盘）
        sourcemap: true,
        logLevel: 'silent',
      })
      res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' })
      res.end(result.outputFiles?.[0]?.text ?? '')
    } catch (err) {
      console.error('[ui-router-demo] build error:', err)
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end(String(err))
    }
    return
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(html)
})

server.listen(port, () => console.log(`ui-dom demo: http://localhost:${port}`))
