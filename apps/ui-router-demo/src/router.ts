/**
 * ui-router-demo 共享路由定义 — server（ssrPage）与 client（uiServe）复用同一 router
 *
 * 美化：仅使用 weifuwu/layout 原语（wf-* 类）与 weifuwu/components 组件——
 * 布局结构用原语类，内容元素用组件，不自己写样式（AGENTS.md §8 布局蓝本纪律）。
 */

import { UIRouter, h } from '../../../src/ui-dom/index.ts'
import type { UIHandler, UIMiddleware } from '../../../src/ui-dom/index.ts'
import { toast } from '../../../src/ui-dom/Toast.ts'
import { Button, Input, Dropdown, Tag, Icon } from '../../../src/components/index.ts'

// ── 交互子组件（两阶段 + 组件级 $）──────────────────────

/** 计数器（组件级 $：赋值 → 本组件重渲染，父 handler 不重跑） */
const Counter = (_init: any, ctx: any) => {
  let count = 0
  const rerender = () => ctx.ui.render()
  return (props: any) =>
    h('div', { id: `counter-${props.id}`, class: 'wf-surface wf-rounded-lg wf-p-lg wf-stack wf-gap-sm' },
      h('div', { class: 'wf-row wf-gap-md' },
        h('h3', { class: 'wf-text-base wf-m-0' }, `计数器 ${props.id}`),
        h(Button, { variant: 'secondary', size: 'sm', onClick: () => { count = count - 1; rerender() } }, '-'),
        h('span', { id: `val-${props.id}`, class: 'wf-nums wf-text-lg wf-text-brand' }, String(count)),
        h(Button, { variant: 'primary', size: 'sm', onClick: () => { count = count + 1; rerender() } }, '+'),
      ),
    )
}

/** keyed 列表（顺序重排复用 DOM） */
const TodoList = (_init: any, ctx: any) => {
  const rerender = () => ctx.ui.render()
  let items = [
    { id: 'a', label: '设计 req/res' },
    { id: 'b', label: '实现 UIRouter' },
    { id: 'c', label: '浏览器冒烟' },
  ]
  const shuffle = () => {
    const arr = [...(items as any[])]
    const first = arr.shift()!
    arr.push(first)
    items = arr
    rerender()
  }
  return () =>
    h('div', { class: 'wf-stack wf-gap-sm' },
      h(Button, { variant: 'secondary', size: 'sm', onClick: shuffle },
        h(Icon, { name: 'refresh', size: 14 }), ' 轮转顺序'),
      h('ul', { id: 'todos', class: 'wf-stack wf-gap-xs wf-m-0 wf-p-0' },
        ...(items as any[]).map((it: any) =>
          h('li', { key: it.id, id: `todo-${it.id}`, class: 'wf-row wf-gap-sm wf-p-sm wf-surface wf-rounded-sm wf-text-sm' },
            h(Tag, { variant: it.id === 'a' ? 'primary' : it.id === 'b' ? 'success' : 'danger' }, it.id),
            h('span', {}, it.label),
          ),
        ),
      ),
    )
}

// ── Layout 中间件（两阶段：外层 mount 拿 children，内层包装）──
const Layout: UIMiddleware = async (_location, ctx, children) => {
  const tabs = [{ path: '/', label: '首页' }, { path: '/todos', label: '列表' }, { path: '/async', label: '异步' }, { path: '/users/42', label: '用户' }, { path: '/admin/api/users/7', label: '后台' }]
  return async (loc, c) => {
    const child = await children(loc, c)
    const path = loc.pathname
    return h('div', { class: 'wf-container wf-my-lg' },
      h('nav', { class: 'wf-row wf-gap-md wf-mb-lg wf-border-b wf-pb-md' },
        ...(tabs as any[]).map((t: any) =>
          h('a', {
            class: t.path === path
              ? 'wf-text-primary wf-text-sm'
              : 'wf-text-secondary wf-text-sm',
            href: t.path,
            onClick: (e: Event) => { e.preventDefault(); window.history.pushState({}, '', t.path); window.dispatchEvent(new PopStateEvent('popstate')) },
          }, t.label),
        ),
      ),
      h('main', { class: 'wf-stack wf-gap-lg' }, child),
    )
  }
}

// ── 页面 handler（async：数据管道 + 原语布局）──

const Home: UIHandler = async (_location, ctx) => {
  // data 缓存（首次取数，重渲染命中）
  const info = await ctx.data.get('/api/info', async () => ({ title: 'ui-dom × components', desc: 'req=location / res=VNode / uiServe=VDOM / components 直接复用' }))
  let clicks = 0
  const rerender = () => ctx.ui.render()
  return h('div', { id: 'home', class: 'wf-surface wf-rounded-lg wf-p-lg wf-stack wf-gap-md' },
    h('div', { class: 'wf-row wf-gap-sm' },
      h(Icon, { name: 'layout', className: 'wf-text-primary' }),
      h('h2', { class: 'wf-text-xl wf-m-0' }, (info as any).title),
    ),
    h('p', { class: 'wf-text-secondary wf-text-sm wf-m-0' }, (info as any).desc),
    h('p', { class: 'wf-text-sm wf-m-0 wf-nums' }, 'query: ', JSON.stringify(ctx.query)),
    h('div', { class: 'wf-row wf-gap-sm' },
      h(Button, { id: 'click-me', onClick: () => { clicks = clicks + 1; rerender() } },
        `点击 ${clicks} 次`),
      h(Button, { variant: 'secondary', onClick: () => (ctx as any).toast?.('来自 ui-dom 的 toast！', 'success') }, '弹 toast'),
    ),
    h('div', { class: 'wf-row wf-gap-xs' },
      h(Tag, { variant: 'primary' }, 'Tag'),
      h(Tag, { variant: 'success' }, '组件复用'),
      h(Input, { placeholder: '受控输入…' }),
    ),
    h(Counter, { id: 'a' }),
    h(Counter, { id: 'b' }),
  )
}

const Todos: UIHandler = async (_location, ctx) => {
  let loaded = true
  return h('div', { id: 'todos-page', class: 'wf-surface wf-rounded-lg wf-p-lg wf-stack wf-gap-md' },
    h('div', { class: 'wf-row wf-gap-sm' },
      h(Icon, { name: 'list', className: 'wf-text-primary' }),
      h('h2', { class: 'wf-text-xl wf-m-0' }, 'keyed 列表（轮转复用 DOM）'),
    ),
    h(TodoList, {}),
  )
}

const User: UIHandler = async (_location, ctx) => {
  // ctx.params（路由参数）
  return h('div', { id: 'user-page', class: 'wf-surface wf-rounded-lg wf-p-lg wf-stack wf-gap-md' },
    h('div', { class: 'wf-row wf-gap-sm' },
      h(Icon, { name: 'users', className: 'wf-text-primary' }),
      h('h2', { class: 'wf-text-xl wf-m-0' }, `用户 ${ctx.params.id}`),
    ),
    h('a', { class: 'wf-text-sm wf-text-secondary wf-row wf-gap-xs', href: '/', onClick: (e: Event) => { e.preventDefault(); window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) } },
      h(Icon, { name: 'arrow-left', size: 14 }), ' 返回'),
  )
}

// ── 原生 async 组件页面（统一签名：async (initProps, ctx) => renderFn）──

const AsyncPage = async (initProps: any, ctx: any) => {
  // 数据管道：三场景自动（SSR→__DATA__ / hydration 种子 / SPA fetch）
  const info = await ctx.data.get('/api/async-page', async () => ({
    title: '原生 async 组件',
    desc: 'async 函数即组件（原生支持）——数据自动进 __DATA__',
  }))
  let clicks = 0
  const rerender = () => ctx.ui.render()
  return (props: any) =>
    h('div', { id: 'async-page', class: 'wf-surface wf-rounded-lg wf-p-lg wf-stack wf-gap-md' },
      h('div', { class: 'wf-row wf-gap-sm' },
        h(Icon, { name: 'zap', className: 'wf-text-primary' }),
        h('h2', { class: 'wf-text-xl wf-m-0' }, (info as any).title),
      ),
      h('p', { class: 'wf-text-secondary wf-text-sm wf-m-0' }, (info as any).desc),
      h('div', { class: 'wf-row wf-gap-xs' },
        h(Tag, { variant: 'primary' }, 'async'),
        h(Tag, { variant: 'success' }, '__DATA__'),
      ),
      h(Button, { id: 'async-click', variant: 'primary', onClick: () => { clicks = clicks + 1; rerender() } },
        h(Icon, { name: 'zap', size: 14 }), ` 点击 ${clicks} 次`),
    )
}

// ── 嵌套路由：/admin 子树（独立中间件链 + 两层嵌套 + 404）──

const AdminLayout: UIMiddleware = async (_loc, ctx, children) => {
  return async (loc, c) => {
    const child = await children(loc, c)
    return h('div', { id: 'admin-shell', class: 'wf-surface wf-rounded-lg wf-p-lg wf-stack wf-gap-md' },
      h('div', { class: 'wf-row wf-gap-sm' },
        h(Icon, { name: 'settings', className: 'wf-text-primary' }),
        h('h2', { class: 'wf-text-xl wf-m-0' }, '管理后台'),
      ),
      h('p', { class: 'wf-text-secondary wf-text-sm wf-m-0' }, '（子路由子树：独立 layout / 嵌套 / 404）'),
      h(Dropdown, {
        trigger: h(Button, { variant: 'secondary' }, '操作', h(Icon, { name: 'chevron-down', size: 14 })),
        items: [
          { key: 'edit', label: '编辑', onClick: () => (ctx as any).toast?.('选择了 编辑', 'info') },
          { key: 'del', label: '删除', danger: true, onClick: () => (ctx as any).toast?.('选择了 删除', 'info') },
        ],
      }),
      child,
    )
  }
}

const admin = new UIRouter()
admin.use(AdminLayout)
admin.get('/', () => h('div', { id: 'admin-home' }, '后台首页'))
admin.get('/settings', () => h('div', { id: 'admin-settings' }, '后台设置'))
admin.notFound(() => h('div', { id: 'admin-nf' }, '后台 404'))

// 两层嵌套：/admin/api/users/:id
const api = new UIRouter()
api.get('/users/:id', (loc, ctx) => h('div', { id: 'api-user' }, `API 用户 ${ctx.params.id}`))
api.notFound(() => h('div', { id: 'api-nf' }, 'API 404'))
admin.use('/api', api)

// ── 应用装配（路由定义在 router.ts——server 与 client 共享） ──

const app = new UIRouter()
app.use(Layout)
app.use(toast())
app.get('/', Home)
app.get('/todos', Todos)
app.get('/users/:id', User)
app.get('/async', (_loc, ctx) => h(AsyncPage, {}))   // handler 返回组件 vnode（async 组件由渲染器原生 mount）
app.use('/admin', admin)
app.notFound(() => h('div', { id: 'nf', class: 'wf-surface wf-rounded-lg wf-p-lg' }, h('h2', { class: 'wf-text-xl' }, '404 — 页面不存在')))

export { app }
