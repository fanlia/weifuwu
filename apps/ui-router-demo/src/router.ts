/**
 * ui-router-demo 共享路由定义 — server（ssrPage）与 client（uiServe）复用同一 router
 *
 * 美化：仅使用 weifuwu/layout 原语（wf-* 类）与 weifuwu/components 组件——
 * 布局结构用原语类，内容元素用组件，不自己写样式（AGENTS.md §8 布局蓝本纪律）。
 */

import { UIRouter, h, createStore } from '../../../src/ui-dom/index.ts'
import type { UIHandler, UIMiddleware, Component } from '../../../src/ui-dom/index.ts'
import { toast } from '../../../src/ui-dom/Toast.ts'
import { confirm as confirmMw } from '../../../src/ui-dom/Confirm.ts'
import { notification as notifMw } from '../../../src/ui-dom/Notification.ts'
import { Button, Input, Dropdown, Tag, Icon, ThemeSwitch } from '../../../src/components/index.ts'

// ── 手动导航（pushState + popstate——uiServe 监听 popstate 执行路由）──
const nav = (path: string) => (e: Event) => {
  e.preventDefault()
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// ── 交互子组件（两阶段 + render-only：改状态后显式 ctx.ui.render()）──────────────────

/** 计数器（组件内部状态：闭包 let + ctx.ui.render()——父 handler 不重跑） */
const Counter = async (_init: any, ctx: any) => {
  let count = 0
  const rerender = () => ctx.ui.render()
  return async (props: any) =>
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
const TodoList = async (_init: any, ctx: any) => {
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
  return async () =>
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
  const tabs = [{ path: '/', label: '首页' }, { path: '/todos', label: '列表' }, { path: '/store', label: 'Store' }, { path: '/hooks', label: 'Hooks' }, { path: '/async', label: '异步' }, { path: '/users/42', label: '用户' }, { path: '/admin/api/users/7', label: '后台' }]
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
            onClick: nav(t.path),
          }, t.label),
        ),
        h('div', { class: 'wf-fill' }),
        h(ThemeSwitch, {}),
      ),
      h('main', { class: 'wf-stack wf-gap-lg' }, child),
    )
  }
}

// ── 页面 handler（async：数据管道 + 原语布局）──

// 点击计数器（独立组件——UIHandler 页面无内部状态，状态放组件（B-1 纪律））
const ClickCounter = async (_init: any, ctx: any) => {
  let clicks = 0
  return async () => h(Button, { id: 'click-me', onClick: () => { clicks = clicks + 1; ctx.ui.render() } }, `点击 ${clicks} 次`)
}

/** 精准刷新面板（R0b：selfId 注册 + 全局定时器 render(['stats'])——页面其他部分不重渲染） */
const StatsPanel = async (_init: any, ctx: any) => {
  ctx.ui.selfId('stats')
  let t = 0
  let alive = true
  const tick = () => {
    if (!alive) return
    t = Date.now()
    ctx.ui.render(['stats'])
    ctx.browser?.timeout(tick, 2000)
  }
  ctx.browser?.timeout(tick, 2000)
  return async () =>
    h('div', { id: 'stats-panel', class: 'wf-surface wf-rounded-lg wf-p-md wf-text-sm wf-stack wf-gap-xs' },
      h('div', { class: 'wf-row wf-gap-sm' },
        h(Icon, { name: 'activity', className: 'wf-text-primary' }),
        h('b', { class: 'wf-text-sm' }, '全局精准刷新（selfId + render([\'stats\'])）'),
      ),
      h('span', { id: 'stats-tick', class: 'wf-nums wf-text-secondary' }, `tick: ${t}`),
    )
}

const Home: UIHandler = async (_location, ctx) => {
  // data 缓存（首次取数，重渲染命中）
  const info = await ctx.data.get('/api/info', async () => ({ title: 'ui-dom × components', desc: 'req=location / res=VNode / uiServe=VDOM / components 直接复用' }))
  return h('div', { id: 'home', class: 'wf-surface wf-rounded-lg wf-p-lg wf-stack wf-gap-md' },
    h('div', { class: 'wf-row wf-gap-sm' },
      h(Icon, { name: 'layout', className: 'wf-text-primary' }),
      h('h2', { class: 'wf-text-xl wf-m-0' }, (info as any).title),
    ),
    h('p', { class: 'wf-text-secondary wf-text-sm wf-m-0' }, (info as any).desc),
    h('p', { class: 'wf-text-sm wf-m-0 wf-nums' }, 'query: ', JSON.stringify(ctx.query)),
    h('div', { class: 'wf-row wf-gap-sm wf-wrap' },
      h(ClickCounter, {}),
      h(Button, { variant: 'secondary', onClick: () => (ctx as any).toast?.('来自 ui-dom 的 toast！', 'success') }, '弹 toast'),
      h(Button, { variant: 'secondary', onClick: async () => {
        const ok = await (ctx as any).confirm?.('确认执行演示操作？', { title: '命令式确认' })
        ;(ctx as any).notification?.success?.({ title: ok ? '已确认' : '已取消', description: ok ? 'confirm 返回 true' : 'confirm 返回 false' })
      } }, 'confirm + notification'),
    ),
    h('div', { class: 'wf-row wf-gap-xs' },
      h(Tag, { variant: 'primary' }, 'Tag'),
      h(Tag, { variant: 'success' }, '组件复用'),
      h(Input, { placeholder: '受控输入…' }),
    ),
    h(Counter, { id: 'a' }),
    h(Counter, { id: 'b' }),
    h(StatsPanel, {}),
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
  return async (props: any) =>
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

// ── 共享状态页（R0a：createStore + useExternal——跨组件实时同步）──

const counterStore = createStore({ n: 0 })

const StorePanel = async (props: any, ctx: any) => {
  const st = ctx.ui.useExternal(counterStore)  // 订阅：store 变化 → 自身重渲染（unmount 退订）——返回 store 活引用
  return async () =>
    h('div', { class: 'wf-surface wf-rounded-lg wf-p-md wf-stack wf-gap-sm' },
      h('div', { class: 'wf-row wf-gap-sm' },
        h('b', { class: 'wf-text-sm' }, `面板 ${props.id}`),
        h('span', { id: `store-val-${props.id}`, class: 'wf-nums wf-text-lg wf-text-brand' }, String(st.state.n)),
      ),
      h('div', { class: 'wf-row wf-gap-xs' },
        h(Button, { size: 'sm', variant: 'secondary', onClick: () => counterStore.set({ n: st.state.n - 1 }) }, '-'),
        h(Button, { size: 'sm', variant: 'primary', onClick: () => counterStore.set({ n: st.state.n + 1 }) }, '+'),
      ),
      h('p', { class: 'wf-text-xs wf-text-secondary wf-m-0' }, '两面板订阅同一 createStore——任一按钮更新双方同步（导航往返状态保持）'),
    )
}

const StorePage: UIHandler = async () =>
  h('div', { id: 'store-page', class: 'wf-surface wf-rounded-lg wf-p-lg wf-stack wf-gap-md' },
    h('div', { class: 'wf-row wf-gap-sm' },
      h(Icon, { name: 'database', className: 'wf-text-primary' }),
      h('h2', { class: 'wf-text-xl wf-m-0' }, '共享状态（createStore + useExternal）'),
    ),
    h(StorePanel, { id: 'a' }),
    h(StorePanel, { id: 'b' }),
  )

// ── Hooks 页（R0c：useInView 懒加载 / useScrollPosition / useBreakpoint）──

/** useInView 懒加载卡片：滚入视口才渲染内容（once-latch，滚走保持） */
const LazyCard = async (props: any, ctx: any) => {
  const inView = ctx.ui.useInView({ threshold: 0.2 })
  let loaded = false
  const ref = (el: any) => inView.observe(el)
  return async () => {
    if (inView.isIn) loaded = true
    return h('div', {
      ref,
      class: 'wf-surface wf-rounded-lg wf-p-md wf-text-sm wf-stack wf-gap-xs',
      style: { minHeight: '60px' },
    },
      h('b', { class: 'wf-text-sm' }, `懒加载卡片 ${props.id}`),
      loaded
        ? h('span', { class: 'wf-text-secondary' }, '内容已渲染（useInView 触发）')
        : h('span', { class: 'wf-text-secondary' }, '未加载——滚动进入视口后渲染'),
    )
  }
}

const HooksPageComp: Component = async (_init: any, ctx: any) => {
  // hooks 必须在组件 mount 阶段调用（handler 每次导航执行——注册监听会重复/泄漏）
  const scroll = ctx.ui.useScrollPosition({})
  let bp = '?'
  ctx.ui.useBreakpoint(
    { mobile: '(max-width: 639px)', tablet: '(min-width: 640px) and (max-width: 1023px)', desktop: '(min-width: 1024px)' },
    (vp: string) => { bp = vp; ctx.ui.render() },
  )
  return async () =>
    h('div', { id: 'hooks-page', class: 'wf-surface wf-rounded-lg wf-p-lg wf-stack wf-gap-md' },
      h('div', { class: 'wf-row wf-gap-sm' },
        h(Icon, { name: 'zap', className: 'wf-text-primary' }),
        h('h2', { class: 'wf-text-xl wf-m-0' }, 'Hooks（事件驱动重渲染）'),
      ),
      h('div', { class: 'wf-row wf-gap-md' },
        h('span', { id: 'hook-scroll', class: 'wf-tag wf-tag--primary wf-nums' }, `scrollY: ${scroll.y}`),
        h('span', { id: 'hook-bp', class: 'wf-tag wf-tag--success' }, `breakpoint: ${bp}`),
      ),
      h('p', { class: 'wf-text-secondary wf-text-sm wf-m-0' }, '滚动窗口观察 scrollY 实时变化；useInView 卡片滚入视口才渲染（滚动到底部）'),
      h('div', { class: 'wf-stack wf-gap-sm wf-mt-md' }, Array.from({ length: 8 }, (_, i) => h(LazyCard, { id: String(i) }))),
    )
}

// ── 错误边界页（R0f：handler 抛错 → .ui-dom-error 错误页，不黑屏）──

const ErrorPage: UIHandler = async () => {
  throw new Error('演示：handler 抛错 → 框架错误页（serve.ts 兜底，不黑屏）')
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
app.use(confirmMw())
app.use(notifMw())
app.get('/', Home)
app.get('/todos', Todos)
app.get('/store', StorePage)
app.get('/hooks', () => h(HooksPageComp, {}))
app.get('/error', ErrorPage)
app.get('/users/:id', User)
app.get('/async', (_loc, ctx) => h(AsyncPage, {}))   // handler 返回组件 vnode（async 组件由渲染器原生 mount）
app.use('/admin', admin)
app.notFound(() => h('div', { id: 'nf', class: 'wf-surface wf-rounded-lg wf-p-lg' }, h('h2', { class: 'wf-text-xl' }, '404 — 页面不存在')))

export { app }
