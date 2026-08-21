/**
 * showcase 测试共享——spawn showcase server（随机端口）+ 页面打开（错误收集）
 * 纯 playwright（项目场景层模式——node:test runner）。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'

const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)))

export interface ScenarioServer {
  base: string
  stop(): void
}

/** spawn showcase server（PORT=0 随机端口——stdout 解析实际端口） */
export function startShowcaseServer(): Promise<ScenarioServer> {
  return new Promise((resolveP, reject) => {
    const server: ChildProcess = spawn('node', [resolve(__dirname, '..', 'server.ts')], {
      cwd: resolve(__dirname, '..', '..', '..'), // apps/showcase/test → 仓库根
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    server.stdout?.on('data', (d) => { logs += String(d) })
    server.stderr?.on('data', (d) => { logs += String(d) })
    const timer = setTimeout(() => {
      server.kill()
      reject(new Error(`showcase server 启动超时:\n${logs}`))
    }, 6000)
    server.stdout?.on('data', (d) => {
      // serve 的 ready 打印
      const m = String(d).match(/weifuwu listening on http:\/\/localhost:(\d+)/)
      if (m) {
        clearTimeout(timer)
        resolveP({
          base: `http://localhost:${m[1]}`,
          stop: () => { try { server.kill() } catch { /* 已退出 */ } },
        })
      }
    })
  })
}

/** 打开页面（domcontentloaded + 等 root 渲染）——返回 console.error 列表 */
export async function openShowcase(page: Page, base: string, path: string): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 8000 })
  await page.waitForFunction(() => {
    const root = document.getElementById('root')
    return root !== null && root.childNodes.length > 0
  }, 'root 渲染', { timeout: 6000 })
  return errors
}
