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

// 兼容别名：startAgentServer = getSharedServer（旧测试文件 before 调用不变——
// 自动共享——after 的 stop() no-op（共享进程不随文件停——posttest 清理））
export const startAgentServer = getSharedServer
// node --test 文件级串行（--test-concurrency=1）下——每文件 spawn **无隔离价值**
// （DB/Redis/沙盒本来共享——隔离靠唯一租户 appSlug——非 server）——只有代价：
// 17 文件 × 2-4s 启动 + 连接池开闭波动 + 冷启动抖动（报表 11s 失败实证）。
// 方案：**固定端口 + 探测复用 + detached 持久**——第一个测试文件 spawn
// （detached——不随测试进程死）——后续文件探测到即复用——posttest 清理。
const SHARED_PORT = 39217
let sharePromise: Promise<AgentServer> | null = null

/** 探测共享 server 是否存活（任何 HTTP 响应 = alive——401/404 都是活的） */
async function probeShared(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${SHARED_PORT}/api/ops`, { signal: AbortSignal.timeout(1000) })
    return res.status < 500 // 401/404/403 = 服务在跑（ops 无 auth——401 是 auth 中间件——alive）
  } catch {
    return false
  }
}

/** 共享 server 单例（懒 spawn——第一个调用者启动——后续复用） */
export function getSharedServer(): Promise<AgentServer> {
  if (sharePromise) return sharePromise
  sharePromise = (async () => {
    if (await probeShared()) {
      return { base: `http://localhost:${SHARED_PORT}`, stop: () => {} }
    }
    // spawn detached（独立进程——跨测试文件存活——posttest 清理）
    // stdio ignore（**关键**：pipe 保持测试进程事件循环活跃 → node --test
    // 永不退出——detached 进程无需日志收集——启动确认靠探活轮询）
    const server: ChildProcess = spawn('node', ['--env-file=.env', 'server.ts'], {
      cwd: APP_ROOT,
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: String(SHARED_PORT),
        DATABASE_POOL_MAX: '8',
        RATE_LIMIT_MAX: '100000',
        REGISTER_LIMIT_MAX: '100000',
        WF_TEST_HOOKS: '1',
      },
    })
    server.unref() // 不阻止测试进程退出
    // 启动确认：轮询探活（stdio ignore 无日志可用——最多 30s）
    const deadline = Date.now() + 30_000
    while (Date.now() < deadline) {
      if (await probeShared()) break
      await new Promise((r) => setTimeout(r, 300))
    }
    if (!(await probeShared())) {
      throw new Error(`共享 server 启动超时（30s）——端口 ${SHARED_PORT}`)
    }
    // PID 文件（posttest 清理用——pkill 匹配不到 env PORT——PID 最可靠）
    try {
      const { writeFileSync } = await import('node:fs')
      if (server.pid) writeFileSync('/tmp/ap-shared-server.pid', String(server.pid))
    } catch { /* 尽力 */ }
    return { base: `http://localhost:${SHARED_PORT}`, stop: () => {} }
  })().catch((e) => { sharePromise = null; throw e }) // 失败重置——下个文件重试
  return sharePromise
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

/** 等待正文出现指定文本（页面异步取数 + rerender——轮询直至出现）
 *  15s（负载下渲染/取数可能偏慢——套件串行跑时 DB 忙——仍能捕获真挂起） */
export async function waitForText(page: Page, text: string, timeoutMs = 15_000): Promise<void> {
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
    // 角色（2026-08——UI 角色测试：viewer 写操作防线需要 role）
    if (payload.role) localStorage.setItem('agent_platform_role', payload.role)
  }, { token: auth.token, refreshToken: auth.refreshToken, user: auth.user, role: auth.app?.role })
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

// ── 角色种子（B-UI 角色测试——2026-08）─────────────────
// 全链路：owner invite（role）→ 新用户 join（registerInApp）→
// 返回 join 用户 TenantAuth（角色生效——DB + 响应双验证——join 响应
// role 修复后正确）——API 驱动（不 SQL 直插——端到端一致）
export async function seedRoleMember(
  base: string,
  owner: TenantAuth,
  role: 'viewer' | 'member' | 'admin',
): Promise<TenantAuth> {
  const stamp = Date.now()
  const email = `seeded-${role}-${stamp}@e2e.test`
  // owner 生成邀请（指定 role）
  const inv = await apiAs(base, owner, '/api/auth/invite', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
  if (!inv?.token) throw new Error(`邀请生成失败: ${JSON.stringify(inv).slice(0, 120)}`)
  // 被邀人 join（registerInApp——复用或建平台账号 + 加成员）
  const join = await apiAs(base, { token: '', refreshToken: null, user: null, app: owner.app }, '/api/auth/join', {
    method: 'POST',
    body: JSON.stringify({ appSlug: owner.app.slug, inviteToken: inv.token, email, password: 'Test123456', name: `种子${role}` }),
  })
  if (!join?.token) throw new Error(`join 失败: ${JSON.stringify(join).slice(0, 120)}`)
  // 断言角色生效（join 响应已验证——修复后返回真实 role）
  if (join.app?.role !== role) {
    throw new Error(`角色种子失败: 期望 ${role} 实得 ${join.app?.role}——join 响应角色修复未生效？`)
  }
  return { token: join.token, refreshToken: join.refreshToken ?? null, user: join.user, app: { ...owner.app, role } }
}

/** 管理员角色：member 加入后提拔部门管理员（department_members.role='admin'） */
export async function seedDeptAdmin(
  base: string,
  owner: TenantAuth,
  deptId: string,
): Promise<TenantAuth> {
  const member = await seedRoleMember(base, owner, 'member')
  // 加为部门成员 + 设 admin（部门管理 API：POST /api/departments/:id/members）
  try {
    await apiAs(base, owner, `/api/departments/${deptId}/members`, {
      method: 'POST',
      body: JSON.stringify({ agent_id: null, user_id: member.user!.id, role: 'admin', name: '部门管理员' }),
    })
  } catch (e: any) {
    // 部门成员 API 形状不同——试 add 端点
    await apiAs(base, owner, `/api/departments/${deptId}/members/add`, {
      method: 'POST',
      body: JSON.stringify({ user_id: member.user!.id, role: 'admin' }),
    })
  }
  return { ...member, app: { ...member.app, role: 'member' } } // 部门级 admin（应用 role 仍 member）
}

// ── 交互断言 helper（点击才暴露的 bug——等待变化而非 sleep）──

/** 点击元素后等待 DOM 出现期望文本（或元素消失——防 403/空态） */
export async function clickAndWait(page: Page, selector: string, expectText?: string | RegExp, timeoutMs = 10_000): Promise<void> {
  await page.click(selector, { timeout: 5000 })
  if (!expectText) {
    await page.waitForTimeout(300)
    return
  }
  await page.waitForFunction(
    (t) => {
      const text = document.body.textContent ?? ''
      if (t instanceof RegExp) return t.test(text)
      return text.includes(t)
    },
    expectText,
    { timeout: timeoutMs },
  )
}

/** 等待 body 出现指定文本（wrapped——供页面数据渲染断言） */
export async function waitForBodyText(page: Page, text: string | RegExp, timeoutMs = 10_000): Promise<void> {
  await page.waitForFunction(
    (t) => {
      const body = document.body.textContent ?? ''
      return t instanceof RegExp ? t.test(body) : body.includes(t)
    },
    text,
    { timeout: timeoutMs },
  )
}
