/**
 * agent-platform UI 测试基建（OPTIMIZE-PLAN-3——对齐 weifuwu/vdom 测试纪律）
 *
 * 旧基建（jsdom + ui-dom createRouter）已随框架重构（ui-dom 删除）失效——
 * 新形态 = 场景层纪律（src/test/scenario/ 与 apps/showcase/test/ 同构）：
 * **playwright + 真实 server（uiServe）**——真实浏览器 + 真实渲染管线 +
 * 真实认证/数据链路——断言 DOM 而非模拟。
 *
 * - spawn server.ts（PORT=0 随机端口——stdout 解析 weifuwu listening 行）
 * - 租户注册（/api/auth/register——一步签发 app token）→ localStorage
 *   注入（agent_platform_token/user/refresh——v3-main 启动读取）→ 认证页可达
 * - 数据种子走真实 API（POST /api/departments、POST /api/agents）——
 *   不直插 SQL（端到端一致——API 形状漂移即测试失败）
 * - console.error/pageerror 收集——页面零错误红线（与场景层一致）
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from 'playwright'

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)))
/** test/ui → apps/agent-platform */
const APP_ROOT = resolve(__dirname, '..', '..')

export interface AgentServer {
  base: string
  stop(): void
}

/** spawn agent-platform server（PORT=0 随机端口——stdout 解析实际端口） */
export function startAgentServer(): Promise<AgentServer> {
  return new Promise((resolveP, reject) => {
    const server: ChildProcess = spawn('node', ['--env-file=.env', 'server.ts'], {
      cwd: APP_ROOT,
      env: {
        ...process.env,
        PORT: '0',
        // 测试隔离：全局限流拉高（多测试文件同窗口串行跑——避免撞 429 误伤页面断言）
        RATE_LIMIT_MAX: '100000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    server.stdout?.on('data', (d) => { logs += String(d) })
    server.stderr?.on('data', (d) => { logs += String(d) })
    const timer = setTimeout(() => {
      server.kill()
      reject(new Error(`agent-platform server 启动超时:\n${logs.slice(-2000)}`))
    }, 30_000) // 启动含 schema 迁移 + 沙盒探测——比场景层 6s 宽（实测 <1s——余量给慢机/冷 docker）
    server.stdout?.on('data', (d) => {
      // 框架 serve 的 ready 打印（与场景层/showcase 同——端口 0 时为实际端口）
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

/** 打开页面（goto + 等 #root 渲染）——返回 console/page 错误列表（页面零错误红线） */
export async function openAgentPage(page: Page, base: string, path: string): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 15_000 })
  await page.waitForFunction(() => {
    const root = document.getElementById('root')
    return root !== null && root.childNodes.length > 0
  }, 'root 渲染', { timeout: 10_000 })
  return errors
}

/** 错误过滤（静态资源 404 类非页面错误——与场景层同口径） */
export function fatalErrors(errors: string[]): string[] {
  return errors.filter((e) => !e.includes('Failed to load resource'))
}

/** 等待正文出现指定文本（页面异步取数 + rerender——轮询直至出现） */
export async function waitForText(page: Page, text: string, timeoutMs = 8_000): Promise<void> {
  await page.waitForFunction(
    (t) => (document.body.textContent ?? '').includes(t),
    text,
    { timeout: timeoutMs },
  )
}

// ── 租户与认证 ────────────────────────────────────────────

export interface TenantAuth {
  token: string
  refreshToken: string | null
  user: { id: string; name?: string; email?: string } | null
  app: { id: string; slug: string; name: string; role: string }
}

/** 注册新租户（唯一邮箱——测试隔离）——register 端点一步签发 app token */
export async function registerTenant(base: string, suffix: string): Promise<TenantAuth> {
  const stamp = Date.now()
  const email = `uitest-${suffix}-${stamp}@e2e.test`
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email, password: 'Test123456', name: `UI测试${suffix}`,
      // appSlug 显式唯一（默认取邮箱域名——多租户测试必撞 slug 唯一键）
      appSlug: `uitest-${suffix}-${stamp}`,
    }),
  })
  if (!res.ok) throw new Error(`register 失败 ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = await res.json() as TenantAuth
  if (!data.token) throw new Error(`register 响应缺 token: ${JSON.stringify(data).slice(0, 200)}`)
  return data
}

/** 注入认证（SPA 启动读取 localStorage——v3-main authClient storage 键） */
export async function injectAuth(page: Page, auth: TenantAuth): Promise<void> {
  await page.addInitScript((payload) => {
    localStorage.setItem('agent_platform_token', payload.token)
    if (payload.refreshToken) localStorage.setItem('agent_platform_refresh', payload.refreshToken)
    if (payload.user) localStorage.setItem('agent_platform_user', JSON.stringify(payload.user))
  }, { token: auth.token, refreshToken: auth.refreshToken, user: auth.user })
}

/** 认证 API 调用（数据种子——真实 API 路径——返回解析后 JSON） */
export async function apiAs(base: string, auth: TenantAuth, path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`API ${init.method ?? 'GET'} ${path} 失败 ${res.status}: ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}
