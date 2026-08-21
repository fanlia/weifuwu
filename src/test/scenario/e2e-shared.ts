/**
 * e2e 共享工具——server 启动/页面打开（多文件并发——总时长压进预算）
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

/** spawn 场景 server（随机端口——stdout 解析实际端口） */
export function startScenarioServer(): Promise<ScenarioServer> {
  return new Promise((resolveP, reject) => {
    const server = spawn('node', [resolve(__dirname, 'server.ts')], {
      cwd: resolve(__dirname, '..', '..', '..'), // src/test/scenario → 仓库根
      env: { ...process.env, SCENARIO_PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    server.stdout?.on('data', (d) => { logs += String(d) })
    server.stderr?.on('data', (d) => { logs += String(d) })
    const timer = setTimeout(() => {
      server.kill()
      reject(new Error(`scenario server 启动超时:\n${logs}`))
    }, 6000)
    server.stdout?.on('data', (d) => {
      const m = String(d).match(/server on :(\d+)/)
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

/** 打开场景页面（goto + 首帧渲染完成 + 错误收集） */
export async function openScenario(page: Page, base: string, id: string): Promise<void> {
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)))
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console.error]', m.text().slice(0, 300)) })
  try {
    await page.goto(`${base}/scenario/${id}`, { waitUntil: 'networkidle' })
    await page.waitForSelector('#root > *')
  } catch (e) {
    console.error('[openScenario]', base, id, String(e).slice(0, 200))
    throw e
  }
}

/** 打开页面 + 返回（测试体用——错误自动收集） */
export async function newPage(browser: Browser): Promise<Page> {
  return browser.newPage()
}
