/**
 * demo server — weifuwu 后端 serve 前端 SPA
 *
 * ```bash
 * cd weifuwu && node apps/demo/server.ts
 * open http://localhost:3000
 * ```
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve, Router, ui, serveStatic, cors, logger } from 'weifuwu'

const __dirname = dirname(fileURLToPath(import.meta.url))

// 用 public/index.html 作为 HTML 模板（内联样式 + 占位符）
const template = readFileSync(resolve(__dirname, 'public', 'index.html'), 'utf-8')

const app = new Router()
app.use(cors())
app.use(logger())

// 前端 SPA 中间件
app.use(ui({
  title: 'weifuwu demo',
  script: '/static/app.js',
  template,
}))

// 静态资源（client bundle）
app.get('/static/*', serveStatic(resolve(__dirname, 'dist')))

// SPA 入口页面 — 这些路径返回 HTML shell
const spaPaths = ['/', '/todo', '/about', '/user/:name']
for (const p of spaPaths) {
  app.get(p, async (req, ctx) => ctx.ui.html())
}

serve(app, { port: 3000 })
console.log('http://localhost:3000')
