import type { UIContext } from 'weifuwu/vdom'
import { h } from 'weifuwu/vdom'
import { Avatar, Button, Icon, Menu } from 'weifuwu/components'
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
]

// 管理员导航（商业化 G2：ADMIN_EMAILS 白名单——/api/admin/me 判定）
const ADMIN_NAV: NavDef[] = [
  { path: '/admin', icon: h(Icon, { name: 'shield' }), label: '租户管理', group: '管理', match: p => p.startsWith('/admin') },
]

export async function AppLayout(_props: {}, ctx: UIContext) {
  // ── 认证守卫 ──
  // 认证守卫（2026-08——框架先清后建修复后的 SPA 方案验证）
  if (!ctx.auth?.isLoggedIn) {
    ctx.afterRender?.(() => { void ctx.app?.navigate('/login') })
    return async (__props: {}) => <div class="wf-center wf-h-full"><Loading /></div>
  }

  const user = (ctx.auth?.user ?? null) as { name?: string; email?: string } | null
  const userName = user?.name ?? '用户'
  const userMail = user?.email ?? ''
  // 管理员导航（G2）：/api/admin/me 判定，仅管理员可见「租户管理」入口
  let isAdmin = false
  void ctx.api?.get<{ isAdmin: boolean }>('/api/admin/me')
    .then((d) => { isAdmin = !!d.isAdmin; ctx.render() })
    .catch(() => {})

  function logout() {
    ctx.auth?.logout?.()
    ctx.app?.navigate('/login')
  }

  return async (__props: { children?: any }) => {
    // 渲染期读取路由（layout 跨子路由复用，mount 捕获的 route 不随导航更新）
    // v3 ctx.route.path = 完整路径（有前导 '/agents'）——去开头斜杠再拼（'/' 保持）
    const route = '/' + (ctx.route?.path ?? '').replace(/^\/+/, '')
    return (
    <div class="wf-app-shell">
      <aside class="wf-sidebar">
        <div class="wf-sidebar-header">
          <Avatar name={(window as any).__whiteLabel?.logo || 'A'} />
          <div class="wf-stack wf-gap-none">
            <span class="wf-text-base wf-text-semibold">{(window as any).__whiteLabel?.name || 'Agent Platform'}</span>
            <small class="wf-uppercase wf-tracking-wide">Multi-Tenant AI</small>
          </div>
        </div>

        <div class="wf-sidebar-body">
          <Menu items={[...NAV, ...(isAdmin ? ADMIN_NAV : [])].map(n => ({ key: n.path, label: n.label, icon: n.icon, group: n.group ?? '工作台' }))}
            activeKey={NAV.find(n => n.match(route))?.path ?? ''}
            onSelect={p => ctx.app?.navigate(p)} />
        </div>

        <div class="wf-sidebar-footer">
          <div class="wf-surface wf-row wf-gap-sm wf-p-sm">
            <Avatar name={userName} size="sm" />
            <div class="wf-fill wf-stack wf-gap-none wf-shrink">
              <div class="wf-text-sm wf-text-semibold wf-truncate">{userName}</div>
              <div class="wf-text-xs wf-text-tertiary wf-truncate">{userMail}</div>
            </div>
            <Button size="sm" variant="ghost" title="设置" onClick={() => ctx.app?.navigate('/settings')}><Icon name="settings" size={16} /></Button>
            <Button size="sm" variant="ghost" title="退出登录" onClick={logout}><Icon name="log-out" size={16} /></Button>
          </div>
        </div>
      </aside>

      <main class="wf-main">
        {__props.children}
      </main>
    </div>
    )
  }
}
