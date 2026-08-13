import type { WfuiContext } from 'weifuwu/ui-dom'
import { h } from 'weifuwu/ui-dom'
import { Avatar, Button, Icon, Menu } from 'weifuwu/components'
import { Loading } from './ui'

interface NavDef {
  path: string
  icon: any
  label: string
  match: (p: string) => boolean
}

// 图标是 VNode（Menu icon 作为 children 渲染——字符串会当文本显示）
const NAV: NavDef[] = [
  { path: '/', icon: h(Icon, { name: 'grid' }), label: '概览', match: p => p === '/' || p === '/dashboard' },
  { path: '/agents', icon: h(Icon, { name: 'cpu' }), label: 'Agent', match: p => p.startsWith('/agents') },
  { path: '/templates', icon: h(Icon, { name: 'layers' }), label: '模板市场', match: p => p.startsWith('/templates') },
  { path: '/departments', icon: h(Icon, { name: 'users' }), label: '部门', match: p => p.startsWith('/departments') },
  { path: '/chat/new', icon: h(Icon, { name: 'message' }), label: '聊天', match: p => p.startsWith('/chat') },
]

export async function AppLayout(_props: {}, ctx: WfuiContext) {
  // ── 认证守卫 ──
  if (!ctx.auth?.isLoggedIn) {
    queueMicrotask(() => ctx.app?.navigate('/login'))
    return async (__props: {}) => <div class="wf-center wf-h-full"><Loading /></div>
  }

  const user = ctx.auth?.user
  const userName = user?.name ?? '用户'
  const userMail = user?.email ?? ''

  function logout() {
    ctx.auth?.logout?.()
    ctx.app?.navigate('/login')
  }

  return async (__props: { children?: any }) => {
    // 渲染期读取路由（layout 跨子路由复用，mount 捕获的 route 不随导航更新）
    // 子路由 'agents' → '/agents'（NAV 匹配用；'/' 保持）
    const route = '/' + (ctx.route?.path ?? '').replace(/^\/+$/, '')
    return (
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
          <Menu items={NAV.map(n => ({ key: n.path, label: n.label, icon: n.icon, group: '工作台' }))}
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
