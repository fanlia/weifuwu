/**
 * weifuwu docs CLI 测试——本地文档服务器端到端
 *
 * spawn node src/cli/docs.ts → 解析 stdout 端口 → fetch 断言：
 *   1. 首页 200（index.md 渲染 HTML——框架 SSR 管线）
 *   2. 组件文档页 200（Markdown 组件渲染——API 表/代码块）
 *   3. 原始 Markdown 端点 200（text/plain——LLM 路径）
 *   4. 未知文档 404
 *   5. 样式 200
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('weifuwu docs：本地文档服务器端到端', { timeout: 30_000 }, async () => {
  const child = spawn('node', ['src/cli/docs.ts', '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => { stdout += d.toString() })
  child.stderr.on('data', (d) => { stderr += d.toString() })

  try {
    // 等待端口出现（stdout 打印 http://localhost:<port>）
    const port = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`启动超时：\n${stdout}\n${stderr}`)), 8000)
      const check = () => {
        const m = stdout.match(/localhost:(\d+)/)
        if (m) { clearTimeout(timer); resolve(m[1]) }
        else if (stderr.includes('Error')) { clearTimeout(timer); reject(new Error(stderr)) }
        else setTimeout(check, 100)
      }
      check()
    })
    const base = `http://localhost:${port}`

    // 1. 首页
    const home = await fetch(`${base}/`)
    assert.equal(home.status, 200, '首页 200')
    const homeHtml = await home.text()
    assert.match(homeHtml, /<title>/, '首页 HTML 渲染')

    // 2. 组件文档页（Markdown 组件 SSR）
    const doc = await fetch(`${base}/components/button`)
    assert.equal(doc.status, 200, '组件文档页 200')
    const docHtml = await doc.text()
    assert.match(docHtml, /Button/, '文档包含组件名')
    assert.match(docHtml, /<table/, 'API 表渲染为 HTML 表格')
    assert.match(docHtml, /用法示例/, '七节模板渲染')

    // 3. 原始 Markdown（LLM 路径）
    const raw = await fetch(`${base}/raw/components/button.md`)
    assert.equal(raw.status, 200, 'raw 200')
    const rawText = await raw.text()
    assert.match(rawText, /^# Button · components/m, 'raw 返回原始 Markdown')

    // 4. 404
    const miss = await fetch(`${base}/components/definitely-not-exist`)
    assert.equal(miss.status, 404, '未知文档 404')

    // 5. 样式
    const css = await fetch(`${base}/components.css`)
    assert.equal(css.status, 200, '样式 200')
    const cssText = await css.text()
    assert.match(cssText, /wf-/, '样式包含布局原语')

    // 6. 其他域
    const guide = await fetch(`${base}/guides/choose`)
    assert.ok(guide.status === 200 || guide.status === 404, 'guides 域可达（P1 填充正文前可为 404）')
  } finally {
    child.kill()
  }
})
