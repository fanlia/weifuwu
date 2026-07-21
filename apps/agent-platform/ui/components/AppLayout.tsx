/**
 * AppLayout — 认证页面的持久化侧边栏布局
 *
 * 作为嵌套路由的 layout 使用：
 *   { path: '/', layout: AppLayout, children: [...] }
 * 子页面渲染在 <RouteView />（嵌套出口）。
 */

import { signal, computed, RouteView, onCleanup } from 'weifuwu/client'
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
  { path: '/departments', icon: '👥', label: '部门', match: p => p.startsWith('/departments') },
  { path: '/chat/new', icon: '💬', label: '聊天', match: p => p.startsWith('/chat') },
]

export function AppLayout(_props: {}, ctx: WfuiContext) {
  // ── 认证守卫 ──
  const loggedIn = ctx.auth?.isLoggedIn
  if (loggedIn && !loggedIn.value) {
    queueMicrotask(() => ctx.app.navigate('/login'))
    return <div class="boot-loading"><div class="spinner"></div></div>
  }

  // ── 响应式当前路径（layout 持久化，需监听路由事件） ──
  const path = signal(ctx.route?.path ?? '/')
  const onRoute = () => { path.value = ctx.route?.path ?? '/' }
  window.addEventListener('wefu:route', onRoute)
  onCleanup(() => window.removeEventListener('wefu:route', onRoute))

  const navClass = (item: NavDef) =>
    computed(() => `nav-item${item.match(path.value) ? ' active' : ''}`)

  const user = ctx.auth?.user
  const userName = computed(() => (user?.value ?? user)?.name ?? '用户')
  const userMail = computed(() => (user?.value ?? user)?.email ?? '')
  const avaChar = computed(() => userName.value[0]?.toUpperCase() ?? 'U')

  function go(e: Event, to: string) {
    e.preventDefault()
    ctx.app.navigate(to)
  }

  function logout() {
    ctx.auth?.logout?.()
    ctx.app.navigate('/login')
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
              class={navClass(item)}
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
