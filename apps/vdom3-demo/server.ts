/**
 * vdom3 demo server — 真实浏览器验证（计数器/列表/条件/路由 + 事件流观测）
 */
import { serve, Router } from '../../src/index.ts'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = new Router()

// 编译 demo（esbuild——vdom3 相对导入）
import { build } from 'esbuild'
let cachedJs = ''
async function compile(): Promise<string> {
  if (cachedJs) return cachedJs
  const r = await build({
    entryPoints: [resolve(__dirname, 'main.ts')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  })
  cachedJs = r.outputFiles[0].text
  return cachedJs
}

app.get('/app.js', async (): Promise<Response> => {
  const js = await compile()
  return new Response(js, { headers: { 'Content-Type': 'application/javascript' } })
})

app.get('/', (): Response => new Response(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>vdom3 demo</title></head>
<body>
  <div id="root"></div>
  <script type="module" src="/app.js"></script>
</body>
</html>`, { headers: { 'Content-Type': 'text/html' } }))

serve(app, { port: 3200 })
console.log('vdom3 demo: http://localhost:3200')
