/**
 * agent-platform 启动入口（W1 拆分——server.ts 1562 → 组装清单）
 *
 * 装配域：src/bootstrap/——env（PUBLIC_BASE_URL 推导）· deps（中间件/依赖
 * 初始化）· routes-public（公开面）· routes-protected（受保护面 + 启动副作用）。
 * 行为零变化（平台 475 验证锚）。
 */
import { serve, Router } from 'weifuwu'
import type { AppCtx } from './src/middleware/ctx.ts'
import { derivePublicBaseUrl } from './src/bootstrap/env.ts'
import { buildAppDeps } from './src/bootstrap/deps.ts'
import { registerPublicRoutes } from './src/bootstrap/routes-public.ts'
import { registerProtectedRoutes } from './src/bootstrap/routes-protected.ts'

async function main() {
  // 2026-12 外部地址推导：PUBLIC_BASE_URL 未配置或含 localhost 时推导宿主 IP
  await derivePublicBaseUrl()

  const app = new Router<AppCtx>()

  // 中间件装配 + 依赖初始化（pg/redis/queue/user/ai/工具/沙盒——deps 承载共享引用）
  const deps = await buildAppDeps(app)

  // 公开 API（无需登录）
  registerPublicRoutes(app, deps)

  // 需要登录 + 租户隔离的路由（+ gql/workflow/messager + 启动副作用）
  await registerProtectedRoutes(app, deps)

  // ── 启动 ────────────────────────────────────────────────

  // PORT 环境变量（测试 spawn 用 PORT=0 随机端口——框架 serve 打印实际端口）
  const port = Number(process.env.PORT ?? 3000)
  const server = serve(app, { port })
  if (port !== 0) console.log(`[agent-platform] http://localhost:${port}`)

  // ── 信号处理（2027-09 决策：不注册 SIGINT/SIGTERM——默认行为=立即退出） ──
  // 曾实现优雅关闭（~8s 多段兑底）——实证是双刃剑：8s 半死窗口正是
  // watch 重启/Ctrl+C 重跑的多实例叠加·连接击穿根源（pg 池满排队→
  // too many clients→启动卡死无声）。进程立即死 → 内核关 socket →
  // PG 秒级回收连接（实测 5 进程 5 连接→2 条）——无窗口无泄漏；
  // 在途事务 PG 断连自动回滚——无数据损坏。
}

main().catch((err) => {
  console.error('[agent-platform] 启动失败:', err)
  process.exit(1)
})
