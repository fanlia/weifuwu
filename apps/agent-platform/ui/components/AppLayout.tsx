import { RouteView } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

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
    return <div class="boot-loading"><div class="spinner"></div></div>
  }

  const user = ctx.auth?.user
  const userName = user?.name ?? '用户'
  const userMail = user?.email ?? ''
  const avaChar = userName[0]?.toUpperCase() ?? 'U'

  function go(e: Event, to: string) {
    e.preventDefault()
    ctx.app?.navigate(to)
  }

  function logout() {
    ctx.auth?.logout?.()
    ctx.app?.navigate('/login')
  }

  return (
    <div class="app-shell">
      <aside class="sidebar">
        <div class="side-brand">
          <div class="side-logo">A</div>
          <div class="side-name">
            Agent Platform
            <small>MULTI-TENANT AI</small>
          </div>
        </div>

        <nav class="side-nav">
          <div class="nav-group">工作台</div>
          {NAV.map(item => (
            <a
              href={item.path}
              class={`nav-item${item.match(route) ? ' active' : ''}`}
              onClick={(e: any) => go(e, item.path)}
            >
              <span class="nav-ico">{item.icon}</span>
              {item.label}
            </a>
          ))}
        </nav>

        <div class="side-footer">
          <div class="user-chip">
            <div class="user-ava">{avaChar}</div>
            <div class="user-meta">
              <div class="user-name">{userName}</div>
              <div class="user-mail">{userMail}</div>
            </div>
            <button class="btn-logout" title="设置" onClick={() => ctx.app?.navigate('/settings')}>⚙</button>
            <button class="btn-logout" title="退出登录" onClick={logout}>⏻</button>
          </div>
        </div>
      </aside>

      <main class="main">
        <RouteView />
      </main>
    </div>
  )
}
