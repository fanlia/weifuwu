# AppLayout — 应用壳模板

复制此文件到你的项目，改导航项、品牌名、认证逻辑。

## 使用方式

```tsx
import { createApp, router, RouteView } from 'weifuwu/client'
import { AppLayout } from './AppLayout'

createApp()
  .use(router({
    routes: [
      // 无侧边栏的页面（登录页等）
      { path: '/login', component: Login, title: '登录' },

      // 有侧边栏的工作台
      { path: '/', layout: AppLayout, children: [
        // 改这里 — 添加你的页面
        { path: '', component: Dashboard, title: '概览' },
        { path: 'users', component: UserList, title: '用户管理' },
        { path: 'users/new', component: NewUser, title: '创建用户' },
      ]},
    ],
  }))
  .mount('#root', () => <RouteView />)
```

## AppLayout 组件

```tsx
// AppLayout.tsx — 复制此文件到你的项目，改你需要的地方

import { RouteView } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, Avatar, Badge } from 'weifuwu/components'

interface NavDef {
  path: string
  icon: string
  label: string
  badge?: number
  match: (p: string) => boolean
}

export function AppLayout(_props: {}, ctx: WfuiContext) {
  const route = ctx.route?.path ?? '/'

  // 改这里 — 定义导航项
  const NAV: NavDef[] = [
    { path: '/', icon: '📊', label: '概览', match: p => p === '/' },
    { path: '/users', icon: '👤', label: '用户', match: p => p.startsWith('/users') },
    { path: '/settings', icon: '⚙', label: '设置', match: p => p.startsWith('/settings') },
  ]

  // 改这里 — 认证守卫（如不需要则删除）
  if (!ctx.auth?.isLoggedIn) {
    queueMicrotask(() => ctx.app?.navigate('/login'))
    return <div class="wf-row" style="padding:40px;justify-content:center">
      <div class="wf-loading" role="status" aria-live="polite">
        <div class="wf-loading-spinner"></div>
        <span class="wf-loading-text">加载中...</span>
      </div>
    </div>
  }

  function go(e: Event, to: string) {
    e.preventDefault()
    ctx.app?.navigate(to)
  }

  return (
    <div class="app-shell" style={{
      display: 'grid',
      gridTemplateColumns: '240px 1fr',
      height: '100vh',
      background: 'var(--wf-color-bg)',
    }}>
      {/* 改这里 — 侧边栏 */}
      <aside style={{
        background: 'var(--wf-color-bg-secondary)',
        borderRight: 'var(--wf-border-width, 1px) solid var(--wf-color-border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* 品牌区 */}
        <div style={{
          padding: 'var(--wf-space-md)',
          borderBottom: 'var(--wf-border-width, 1px) solid var(--wf-color-border)',
          fontFamily: 'var(--wf-font-sans)',
          fontWeight: 'var(--wf-font-weight-semibold)',
          fontSize: 'var(--wf-font-size-lg)',
          color: 'var(--wf-color-text)',
        }}>
          {/* 改这里 — 品牌名 */}
          应用名称
        </div>

        {/* 改这里 — 导航菜单 */}
        <nav style={{
          flex: 1,
          padding: 'var(--wf-space-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
          overflowY: 'auto',
        }}>
          {NAV.map(item => (
            <a
              href={item.path}
              onClick={(e: any) => go(e, item.path)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--wf-gap-sm)',
                padding: 'var(--wf-space-sm) var(--wf-space)',
                borderRadius: 'var(--wf-radius)',
                textDecoration: 'none',
                color: item.match(route) ? 'var(--wf-color-primary)' : 'var(--wf-color-text)',
                background: item.match(route) ? 'var(--wf-color-primary-bg, rgba(59,130,246,0.08))' : 'transparent',
                fontWeight: item.match(route) ? 'var(--wf-font-weight-medium)' : 'var(--wf-font-weight-normal)',
                fontFamily: 'var(--wf-font-sans)',
                fontSize: 'var(--wf-font-size-sm)',
                transition: 'all var(--wf-transition)',
              }}
            >
              <span>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge ? <Badge size="sm">{item.badge}</Badge> : null}
            </a>
          ))}
        </nav>

        {/* 改这里 — 用户信息（如需要） */}
        {ctx.auth?.user ? (
          <div style={{
            padding: 'var(--wf-space-md)',
            borderTop: 'var(--wf-border-width, 1px) solid var(--wf-color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--wf-gap-sm)',
          }}>
            <Avatar name={ctx.auth.user.name ?? '用户'} size="sm" />
            <div style={{
              flex: 1,
              minWidth: 0,
              fontFamily: 'var(--wf-font-sans)',
            }}>
              <div style={{
                fontSize: 'var(--wf-font-size-sm)',
                color: 'var(--wf-color-text)',
                fontWeight: 'var(--wf-font-weight-medium)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {ctx.auth.user.name ?? '用户'}
              </div>
              <div style={{
                fontSize: 'var(--wf-font-size-xs)',
                color: 'var(--wf-color-text-tertiary)',
              }}>
                {ctx.auth.user.email ?? ''}
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      {/* 内容区 */}
      <main style={{
        overflow: 'auto',
        padding: 'var(--wf-space-lg)',
      }}>
        <RouteView />
      </main>
    </div>
  )
}
```

## 原理说明

- `router()` 中间件把 URL 解析为 `ctx.route`（含 `path`, `params`, `query`, `title`, `chain`）
- `RouteView` 遍历 `ctx.route.chain`，从外到内逐层渲染 layout → layout → component
- AppLayout 放在最外层，管理侧边栏 + 认证守卫，内部用 `<RouteView />` 渲染子页面
- 每个子页面（Dashboard, UserList...）只需要关注页面内容，不需要管侧边栏

## 改这里

- **导航列表** — `NAV` 数组，加/删/改导航项
- **品牌名** — "应用名称"改为你的品牌
- **认证守卫** — 改成你的 auth 中间件判断逻辑
- **用户信息** — 从 `ctx.auth.user` 改为你的用户数据结构
- **侧边栏宽度** — `gridTemplateColumns: '240px 1fr'` 改数字
