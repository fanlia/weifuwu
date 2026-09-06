/**
 * 应用壳装配器（AppLayout 业务面 + 库 AppShell 组件）
 *
 * 分层（agent-platform 组件入库后形态——W3）：
 * - **库 AppShell**（weifuwu/components）：品牌 + 分组导航 + 用户区 + 抽屉
 *   （移动端——mobile 父层驱动）+ 徽标（Menu badge）——通用壳零业务
 * - **本装配器（平台层——ui/blocks）**：业务接线面——认证守卫（未登录 →
 *   /login）· 管理员导航（/api/admin/me 会话级缓存）· 审批徽章（pending
 *   approvals 计数）· 导航数据（lib/nav.ts NAV/ADMIN_NAV）· onNavigate/
 *   onSettings/onLogout 直通 · 移动 breakpoint（页面级 useBreakpoint——
 *   SSR 守卫期 Loading 一致）
 *
 * AppLayout.tsx 已随组件入库删除（2027-09——功能面拆分：通用 → AppShell，
 * 业务 → 本装配器）。
 */
import type { RenderCtx, UIContext } from 'weifuwu/vdom'
import { h } from 'weifuwu/vdom'
import { AppShell, Icon, Loading } from 'weifuwu/components'
import type { AppShellNavItem } from 'weifuwu/components'
import { NAV, ADMIN_NAV } from '../lib/nav'

// ── isAdmin 会话级缓存（模块级单飞：一次会话拉一次——角色变更需重新登录）──
let adminCache: boolean | null = null
let adminPromise: Promise<void> | null = null

/** 路由归一（'/dashboard' → '/' 工作台——AppShell '/' 精确匹配锚点） */
const navPathOf = (route: string): string => (route === '/dashboard' ? '/' : route)

/** 壳装配器——业务接线 + AppShell 通用壳（页面路由包裹组件） */
export const AppChrome = (_props: { children?: any }, ctx: UIContext & RenderCtx) => {
  // ── 认证守卫 ──
  if (!ctx.auth?.isLoggedIn) {
    ctx.afterRender?.(() => { void ctx.app?.navigate('/login') })
    return (__props: { children?: any }) => h('div', { class: 'wf-center wf-height-full' }, h(Loading))
  }

  const user = (ctx.auth?.user ?? null) as { name?: string; email?: string } | null
  const userName = user?.name ?? '用户'
  const userMail = user?.email ?? ''

  // ── 管理员导航（/api/admin/me 判定——仅管理员可见「租户管理」）──
  let isAdmin = adminCache !== null ? adminCache : false
  if (adminPromise === null) {
    adminPromise = ctx.api?.get<{ isAdmin: boolean }>('/api/admin/me')
      .then((d) => { adminCache = !!d.isAdmin; ctx.render() })
      .catch(() => { adminCache = false })
      .finally(() => { adminPromise = null }) as Promise<void>
  }

  // ── 移动断点（页面级——SSR 守卫期 Loading 一致；登录后客户端激活）──
  const bp = ctx.ui.useBreakpoint({ mobile: 0, desktop: 768 })
  const isMobile = bp() === 'mobile'

  // ── 审批待办徽章（导航时拉取——不独立轮询）──
  let pendingCount = 0
  let fetchedRoute = ''
  const fetchPending = () => {
    void ctx.api?.get<{ pending: unknown[] }>('/api/messages/pending-approvals')
      .then((d) => {
        const n = d.pending?.length ?? 0
        if (n !== pendingCount) { pendingCount = n; ctx.render() }
      })
      .catch(() => { /* 徽章降级为无数字——不阻断导航 */ })
  }
  fetchPending()

  function logout() {
    ctx.auth?.logout?.()
    void ctx.app?.navigate('/login')
  }

  return (__props: { children?: any }) => {
    // 渲染期读取路由（layout 跨子路由复用——mount 捕获不随导航更新）
    const route = '/' + (ctx.route?.path ?? '').replace(/^\/+/, '')
    if (route !== fetchedRoute) {
      fetchedRoute = route
      ctx.afterRender?.(fetchPending)
    }

    const navItems: AppShellNavItem[] = [...NAV, ...(isAdmin ? ADMIN_NAV : [])].map((n) => ({
      key: n.path,
      label: n.label,
      icon: h(Icon, { name: n.icon }),
      group: n.group ?? '工作台',
      badge: n.path === '/approvals' && pendingCount > 0 ? pendingCount : undefined,
    }))

    return h(AppShell, {
      nav: navItems,
      path: navPathOf(route),
      brand: { name: (window as any).__whiteLabel?.name || 'Agent Platform', logo: (window as any).__whiteLabel?.logo || 'A' },
      user: user ? { name: userName, email: userMail } : null,
      mobile: isMobile,
      onNavigate: (k: string) => { ctx.app?.navigate(k); fetchPending() },
      onSettings: () => { ctx.app?.navigate('/settings') },
      onLogout: logout,
      mobileTitle: (window as any).__whiteLabel?.name || 'Agent Platform',
    }, __props.children)
  }
}
