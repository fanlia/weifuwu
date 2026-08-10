/**
 * ui-router-demo 共享路由定义 — server（ssrPage）与 client（uiServe）复用同一 router
 */

import { UIRouter, h } from '../../../src/ui-dom/index.ts'
import type { UIHandler, UIMiddleware } from '../../../src/ui-dom/index.ts'
import { toast } from '../../../src/ui-dom/Toast.ts'
import { Button, Input, Dropdown, Tag } from '../../../src/components/index.ts'

// ── 交互子组件（两阶段 + 组件级 $）──────────────────────

/** 计数器（组件级 $：赋值 → 本组件重渲染，父 handler 不重跑） */
const Counter = (_init: any, ctx: any) => {
  const $ = ctx.ui.$()
  $.count = 0
  return (props: any) =>
    h('div', { id: `counter-${props.id}`, class: 'page' },
      h('h3', {}, `计数器 ${props.id}`),
      h(Button, { variant: 'secondary', size: 'sm', onClick: () => { $.count = $.count - 1 } }, '-'),
      h('span', { id: `val-${props.id}` }, String($.count)),
      h(Button, { variant: 'primary', size: 'sm', onClick: () => { $.count = $.count + 1 } }, '+'),
    )
}

/** keyed 列表（顺序重排复用 DOM） */
const TodoList = (_init: any, ctx: any) => {
  const $ = ctx.ui.$()
  $.items = [
    { id: 'a', label: '设计 req/res' },
    { id: 'b', label: '实现 UIRouter' },
    { id: 'c', label: '浏览器冒烟' },
  ]
  const shuffle = () => {
    const arr = [...($.items as any[])]
    const first = arr.shift()!
    arr.push(first)
    $.items = arr
  }
  return () =>
    h('div', {},
      h(Button, { variant: 'secondary', size: 'sm', onClick: shuffle }, '轮转顺序'),
      h('ul', { id: 'todos' },
        ...($.items as any[]).map((it: any) =>
          h('li', { key: it.id, id: `todo-${it.id}` }, `${it.id}: ${it.label}`),
        ),
      ),
    )
}

// ── Layout 中间件（两阶段：外层 mount 拿 children，内层包装）──
const Layout: UIMiddleware = async (_location, ctx, children) => {
  const $ = ctx.ui.$()
  $.tabs = [{ path: '/', label: '首页' }, { path: '/todos', label: '列表' }, { path: '/users/42', label: '用户' }, { path: '/admin/api/users/7', label: '后台' }]
  return async (loc, c) => {
    const child = await children(loc, c)
    return h('div', { class: 'shell' },
      h('nav', {},
        ...($.tabs as any[]).map((t: any) =>
          h('a', {
            href: t.path,
            onClick: (e: Event) => { e.preventDefault(); window.history.pushState({}, '', t.path); window.dispatchEvent(new PopStateEvent('popstate')) },
          }, t.label),
        ),
      ),
      child,
    )
  }
}

// ── 页面 handler（异步组件：async (location, ctx) => VNode）──

const Home: UIHandler = async (_location, ctx) => {
  // data 缓存（首次取数，重渲染命中）
  const info = await ctx.data.get('/api/info', async () => ({ title: 'ui-dom × components', desc: 'req=location / res=VNode / uiServe=VDOM / components 直接复用' }))
  const $ = ctx.ui.$()
  $.clicks = $.clicks ?? 0
  return h('div', { id: 'home', class: 'page' },
    h('h2', {}, (info as any).title),
    h('p', {}, (info as any).desc),
    h('p', {}, 'query: ', JSON.stringify(ctx.query)),
    h('p', {},
      h(Button, { id: 'click-me', onClick: () => { $.clicks = $.clicks + 1 } },
        `点击 ${$.clicks} 次`),
    ),
    h('p', {},
      h(Button, { variant: 'secondary', onClick: () => (ctx as any).toast?.('来自 ui-dom 的 toast！', 'success') }, '弹 toast'),
    ),
    h('p', {}, h(Tag, { color: 'blue' }, 'Tag'), ' ', h(Tag, { color: 'green' }, '组件复用')),
    h('div', {}, h(Input, { placeholder: '受控输入…' })),
    h(Counter, { id: 'a' }),
    h(Counter, { id: 'b' }),
  )
}

const Todos: UIHandler = async (_location, ctx) => {
  const $ = ctx.ui.$()
  $.loaded = $.loaded ?? true
  return h('div', { id: 'todos-page', class: 'page' },
    h('h2', {}, 'keyed 列表（轮转复用 DOM）'),
    h(TodoList, {}),
  )
}

const User: UIHandler = async (_location, ctx) => {
  // ctx.params（路由参数）
  return h('div', { id: 'user-page', class: 'page' },
    h('h2', {}, `用户 ${ctx.params.id}`),
    h('a', { href: '/', onClick: (e: Event) => { e.preventDefault(); window.history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) } }, '← 返回'),
  )
}

// ── 嵌套路由：/admin 子树（独立中间件链 + 两层嵌套 + 404）──

const AdminLayout: UIMiddleware = async (_loc, ctx, children) => {
  return async (loc, c) => {
    const child = await children(loc, c)
    return h('div', { id: 'admin-shell', class: 'page' },
      h('h2', {}, '管理后台'),
      h('p', {}, '（子路由子树：独立 layout / 嵌套 / 404）'),
      h(Dropdown, {
        trigger: h(Button, { variant: 'secondary' }, '操作 ▼'),
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



// ── 应用装配（server 与 client 共享的 router 定义） ──

const app = new UIRouter()
app.use(Layout)
app.use(toast())
app.get('/', Home)
app.get('/todos', Todos)
app.get('/users/:id', User)
app.use('/admin', admin)
app.notFound(() => h('div', { id: 'nf', class: 'page' }, h('h2', {}, '404 — 页面不存在')))

export { app }
