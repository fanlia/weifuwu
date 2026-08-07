import { RouteView } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { Avatar, Button } from 'weifuwu/components'
import { Loading } from './ui'

interface NavDef {
  path: string
  icon: string
  label: string
  match: (p: string) => boolean
}

const NAV: NavDef[] = [
  { path: '/', icon: '📊', label: '概览', match: p => p === '/' || p === '/dashboard' },
  { path: '/agents', icon: '🤖', label: 'Agent', match: p => p.startsWith('/agents') },
  { path: '/companies', icon: '🏢', label: '公司', match: p => p.startsWith('/companies') },
  { path: '/departments', icon: '👥', label: '部门', match: p => p.startsWith('/departments') },
  { path: '/chat/new', icon: '💬', label: '聊天', match: p => p.startsWith('/chat') },
]

export function AppLayout(_props: {}, ctx: WfuiContext) {
  const route = ctx.route?.path ?? '/'

  // ── 认证守卫 ──
  if (!ctx.auth?.isLoggedIn) {
    queueMicrotask(() => ctx.app?.navigate('/login'))
    return (__props: {}) => <div class="wf-center wf-h-full"><Loading /></div>
  }

  const user = ctx.auth?.user
  const userName = user?.name ?? '用户'
  const userMail = user?.email ?? ''

  function go(e: Event, to: string) {
    e.preventDefault()
    ctx.app?.navigate(to)
  }

  function logout() {
    ctx.auth?.logout?.()
    ctx.app?.navigate('/login')
  }

  return (__props: {}) => (
    <div class="wf-app-shell">
      <aside class="wf-sidebar">
        <div class="wf-sidebar-header">
          <Avatar name="A" />
          <div class="wf-stack wf-gap-none">
            <span class="wf-text-base wf-text-semibold">Agent Platform</span>
            <small class="wf-uppercase wf-tracking-wide">Multi-Tenant AI</small>
          </div>
        </div>

        <div class="wf-sidebar-body">
          <nav class="wf-nav">
            <div class="wf-nav-group">工作台</div>
            {NAV.map(item => (
              <a
                href={item.path}
                class={`wf-nav-item${item.match(route) ? ' wf-nav-item--active' : ''}`}
                onClick={(e: any) => go(e, item.path)}
              >
                <span class="wf-nav-icon">{item.icon}</span>
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div class="wf-sidebar-footer">
          <div class="wf-surface wf-row wf-gap-sm wf-p-sm">
            <Avatar name={userName} size="sm" />
            <div class="wf-fill wf-stack wf-gap-none wf-shrink">
              <div class="wf-text-sm wf-text-semibold wf-truncate">{userName}</div>
              <div class="wf-text-xs wf-text-tertiary wf-truncate">{userMail}</div>
            </div>
            <Button size="sm" variant="ghost" title="设置" onClick={() => ctx.app?.navigate('/settings')}>⚙</Button>
            <Button size="sm" variant="ghost" title="退出登录" onClick={logout}>⏻</Button>
          </div>
        </div>
      </aside>

      <main class="wf-main">
        <RouteView />
      </main>
    </div>
  )
}
