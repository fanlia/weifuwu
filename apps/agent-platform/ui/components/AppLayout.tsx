import type { UIContext } from 'weifuwu/vdom'
import { h } from 'weifuwu/vdom'
import { Avatar, Button, Icon, Menu, NavBar } from 'weifuwu/components'
import { Loading } from './ui'

interface NavDef {
  path: string
  icon: any
  label: string
  group?: string
  match: (p: string) => boolean
}

// 图标是 VNode（Menu icon 作为 children 渲染——字符串会当文本显示）
const NAV: NavDef[] = [
  { path: '/', icon: h(Icon, { name: 'grid' }), label: '工作台', group: '工作台', match: p => p === '/' || p === '/dashboard' },
  { path: '/chat/new', icon: h(Icon, { name: 'message' }), label: '聊天', group: '工作台', match: p => p.startsWith('/chat') },
  { path: '/approvals', icon: h(Icon, { name: 'check-circle' }), label: '审批待办', group: '工作台', match: p => p.startsWith('/approvals') },
  { path: '/deliverables', icon: h(Icon, { name: 'inbox' }), label: '交付物', group: '工作台', match: p => p.startsWith('/deliverables') },
  { path: '/agents', icon: h(Icon, { name: 'cpu' }), label: 'Agent', group: '管理', match: p => p.startsWith('/agents') },
  { path: '/sandboxes', icon: h(Icon, { name: 'box' }), label: '沙盒', group: '管理', match: p => p.startsWith('/sandboxes') },
  { path: '/templates', icon: h(Icon, { name: 'layers' }), label: '模板市场', group: '管理', match: p => p.startsWith('/templates') },
  { path: '/departments', icon: h(Icon, { name: 'users' }), label: '部门', group: '管理', match: p => p.startsWith('/departments') },
  { path: '/reports', icon: h(Icon, { name: 'bar-chart' }), label: '运营报表', group: '管理', match: p => p.startsWith('/reports') },
  { path: '/surveys', icon: h(Icon, { name: 'target' }), label: '问卷', group: '管理', match: p => p.startsWith('/surveys') },
  { path: '/workflows', icon: h(Icon, { name: 'zap' }), label: '工作流', group: '管理', match: p => p.startsWith('/workflows') },
]

// 管理员导航（商业化 G2：ADMIN_EMAILS 白名单——/api/admin/me 判定）
const ADMIN_NAV: NavDef[] = [
  { path: '/admin', icon: h(Icon, { name: 'shield' }), label: '租户管理', group: '管理', match: p => p.startsWith('/admin') },
]

export function AppLayout(_props: {}, ctx: UIContext) {
  // ── 认证守卫 ──
  // 认证守卫（2026-08——框架先清后建修复后的 SPA 方案验证）
  if (!ctx.auth?.isLoggedIn) {
    ctx.afterRender?.(() => { void ctx.app?.navigate('/login') })
    return (__props: {}) => <div class="wf-center wf-height-full"><Loading /></div>
  }

  const user = (ctx.auth?.user ?? null) as { name?: string; email?: string } | null
  const userName = user?.name ?? '用户'
  const userMail = user?.email ?? ''
  // 管理员导航（G2）：/api/admin/me 判定，仅管理员可见「租户管理」入口
  // UX-PLAN-2 波次 4：会话级缓存（v 模块级 promise）——旧实现每导航重复请求
  let isAdmin = adminCache !== null ? adminCache : false
  if (adminPromise === null) {
    adminPromise = ctx.api?.get<{ isAdmin: boolean }>('/api/admin/me')
      .then((d) => { adminCache = !!d.isAdmin; ctx.render() })
      .catch(() => { adminCache = false })
      .finally(() => { adminPromise = null }) as Promise<void>
  }

  // ── 移动端外壳（UX-PLAN-2 波次 3——框架 layout 明确抽屉属应用层职责）──
  // getter 形态断点（hook getter 纪律——任何位置调用返回最新值）。
  // 断点语义：当前匹配的最大 min-width 档名——必须两档（mobile:0 基档）——
  // 单档 {desktop:768} 窄屏不匹配 min-width 时仍返回首项名 'desktop'（语义反转）
  const bp = ctx.ui.useBreakpoint({ mobile: 0, desktop: 768 })
  let drawerOpen = false
  const closeDrawer = () => { if (drawerOpen) { drawerOpen = false; ctx.render() } }
  // Escape 关闭抽屉（键盘可达性——useGlobalKey 自动卸载退订）
  ctx.ui.useGlobalKey('Escape', () => closeDrawer())

  // ── 审批待办徽章（UX-PLAN-2 波次 4：工作台黄条只在首页可见——非首页零感知）──
  // 时机纪律：挂载 + 导航时拉取（不新增独立轮询定时器——ai_draft ws 广播按房间
  // ——layout 不入房间——导航拉取是事件驱动的合法收敛点）
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
    ctx.app?.navigate('/login')
  }

  return (__props: { children?: any }) => {
    // 渲染期读取路由（layout 跨子路由复用，mount 捕获的 route 不随导航更新）
    // v3 ctx.route.path = 完整路径（有前导 '/agents'）——去开头斜杠再拼（'/' 保持）
    const route = '/' + (ctx.route?.path ?? '').replace(/^\/+/, '')
    // 审批徽章：路由变化 → afterRender 拉取（渲染纯同步——副作用出渲染路径——
    // 与认证守卫的 afterRender navigate 同一合法位）
    if (route !== fetchedRoute) {
      fetchedRoute = route
      ctx.afterRender?.(fetchPending)
    }
    const isMobile = bp() === 'mobile'
    const brandName = (window as any).__whiteLabel?.name || 'Agent Platform'
    const navItems = [...NAV, ...(isAdmin ? ADMIN_NAV : [])]
    return (
    <div class="wf-app-shell">
      <aside class={`wf-sidebar${isMobile && drawerOpen ? ' ap-drawer--open' : ''}`}>
        <div class="wf-sidebar-header">
          <Avatar name={(window as any).__whiteLabel?.logo || 'A'} />
          <div class="wf-stack wf-gap-none wf-fill">
            <span class="wf-font-base wf-semibold">{brandName}</span>
            <small class="wf-uppercase wf-tracking-wide">Multi-Tenant AI</small>
          </div>
          {isMobile && (
            <Button size="sm" variant="ghost" title="关闭菜单" aria-label="关闭菜单" onClick={closeDrawer}>
              <Icon name="close" size={16} />
            </Button>
          )}
        </div>

        <div class="wf-sidebar-body">
          <Menu items={navItems.map(n => ({
            key: n.path,
            // 审批徽章（波次 4）：pending>0 且目标项——label 携带数字胶囊
            label: n.path === '/approvals' && pendingCount > 0
              ? <span class="wf-row wf-gap-xs wf-items-center">{n.label}<span class="ap-nav-badge">{pendingCount > 99 ? '99+' : pendingCount}</span></span>
              : n.label,
            icon: n.icon,
            group: n.group ?? '工作台',
          }))}
            activeKey={NAV.concat(isAdmin ? ADMIN_NAV : []).find(n => n.match(route))?.path ?? ''}
            onSelect={p => { ctx.app?.navigate(p); closeDrawer(); fetchPending() }} />
        </div>

        <div class="wf-sidebar-footer">
          <div class="wf-surface wf-row wf-gap-sm wf-padding-sm">
            <Avatar name={userName} size="sm" />
            <div class="wf-fill wf-stack wf-gap-none wf-shrink">
              <div class="wf-font-sm wf-semibold wf-truncate">{userName}</div>
              <div class="wf-font-xs wf-text-tertiary wf-truncate">{userMail}</div>
            </div>
            <Button size="sm" variant="ghost" title="设置" onClick={() => { ctx.app?.navigate('/settings'); closeDrawer() }}><Icon name="settings" size={16} /></Button>
            <Button size="sm" variant="ghost" title="退出登录" onClick={logout}><Icon name="log-out" size={16} /></Button>
          </div>
        </div>
      </aside>

      {/* 遮罩（抽屉开启时——点击关闭） */}
      {isMobile && drawerOpen && <div class="ap-drawer-overlay" onClick={closeDrawer} />}

      <div class="ap-body">
        {/* 移动顶栏（<768px——isMobile 条件渲染；汉堡开抽屉 + 品牌 + 设置）——框架 NavBar 组件（第十一批迁移——手搓 ap-topbar 清零） */}
        {isMobile && (
          <NavBar
            title={brandName}
            align="left"
            fixed
            left={
              <Button size="sm" variant="ghost" title="打开菜单"
                aria-label="打开菜单"
                onClick={() => { drawerOpen = !drawerOpen; ctx.render() }}>
                <Icon name="menu" size={20} />
              </Button>
            }
            right={
              <Button size="sm" variant="ghost" title="设置" onClick={() => ctx.app?.navigate('/settings')}><Icon name="settings" size={16} /></Button>
            }
          />
        )}

        <main class="wf-main">
          {__props.children}
        </main>
      </div>
    </div>
    )
  }
}

// ── isAdmin 会话级缓存（UX-PLAN-2 波次 4 顺手收敛——旧实现每导航重复请求）──
// 模块级单飞：一次会话拉一次（角色变更需重新登录生效——可接受语义）
let adminCache: boolean | null = null
let adminPromise: Promise<void> | null = null
