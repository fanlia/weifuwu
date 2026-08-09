# 前端中间件与工具（weifuwu/client）

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

## router + RouteView — 前端路由

```tsx
import { createApp, router, RouteView } from 'weifuwu/client'
import type { RouteDef, WfuiContext } from 'weifuwu/client'

const routes: RouteDef[] = [
  { path: '/', component: Home },
  { path: '/users', component: UserList },
  { path: '/users/:id', component: UserDetail },
]

createApp()
  .use(router({
    routes,
    mode: 'history',  // 或 'hash'
    notFound: NotFoundPage,
  }))
  .mount('#root', () => () => <RouteView />)  // 根组件也要两阶段：外层返回 render 函数
```

### 嵌套布局

```tsx
const routes = [
  {
    path: '/dashboard',
    layout: DashboardLayout,      // 持久布局（包含 RouteView）
    children: [
      { path: '/overview', component: Overview },
      { path: '/settings', component: Settings },
    ],
  },
]

function DashboardLayout(_props: {}, ctx: WfuiContext) {
  return (props) => (
    <div style="display:flex">
      <aside>导航菜单</aside>
      <main><RouteView /></main>  {/* 渲染子路由 */}
    </div>
  )
}
```

### 编程式导航

```tsx
// 在任意组件中
ctx.app?.navigate('/users/123?tab=profile')
```

| ctx 注入 | 类型 | 说明 |
|----------|------|------|
| `ctx.route.path` | `string` | 当前路由路径 |
| `ctx.route.params` | `Record<string, string>` | URL 参数 |
| `ctx.route.query` | `Record<string, string>` | 查询参数 |
| `ctx.app.navigate(path)` | `(string) => void` | 编程式导航 |

| RouterOptions | 类型 | 默认值 | 说明 |
|---------------|------|--------|------|
| `routes` | `RouteDef[]` | — | 路由定义 |
| `mode` | `'history' \| 'hash'` | `'history'` | 路由模式 |
| `notFound` | `Component` | — | 404 页面 |

| RouteDef | 类型 | 说明 |
|----------|------|------|
| `path` | `string` | 路径（支持 `:param`） |
| `component` | `Component` | 页面组件 |
| `layout` | `Component` | 布局组件（内含 `<RouteView />`） |
| `children` | `RouteDef[]` | 子路由 |
| `auth` | `boolean` | 是否需要认证（配合 auth 中间件） |
| `title` | `string` | 页面标题（自动设置 `document.title`） |

---

## api — HTTP 客户端中间件

```tsx
import { createApp, api } from 'weifuwu/client'

createApp()
  .use(api({ baseURL: '/api' }))
  .mount('#root', App)

// 在组件中使用
async function loadUsers(ctx: WfuiContext) {
  const users = await ctx.api?.get<User[]>('/users')
  const user = await ctx.api?.get<User>('/users/1')
  const created = await ctx.api?.post<User>('/users', { name: 'Alice' })
  await ctx.api?.put('/users/1', { name: 'Bob' })
  await ctx.api?.patch('/users/1', { name: 'Bob' })
  await ctx.api?.delete('/users/1')
}
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `baseURL` | `string` | `''` | API 基础路径 |
| `headers` | `Record<string, string>` | `{ 'Content-Type': 'application/json' }` | 默认请求头 |
| `onRequest` | `(req) => { url, init }` | — | 请求拦截器 |
| `onResponse` | `(res) => Promise<T>` | — | 响应拦截器 |
| `timeout` | `number` | `0`（无超时） | 请求超时（ms）|

| ctx.api 方法 | 签名 | 说明 |
|-------------|------|------|
| `api.get(url, opts?)` | `<T>(string, ApiRequestOptions?) => Promise<T>` | GET |
| `api.post(url, body?, opts?)` | `<T>(string, unknown?, ApiRequestOptions?) => Promise<T>` | POST |
| `api.put(url, body?, opts?)` | `<T>(string, unknown?, ApiRequestOptions?) => Promise<T>` | PUT |
| `api.patch(url, body?, opts?)` | `<T>(string, unknown?, ApiRequestOptions?) => Promise<T>` | PATCH |
| `api.delete(url, opts?)` | `<T>(string, ApiRequestOptions?) => Promise<T>` | DELETE |

```ts
// 错误处理
try {
  await ctx.api!.get('/users')
} catch (e) {
  if (e instanceof ApiError) {
    console.log(e.status, e.body)  // e.g. 404, 'Not Found'
  }
}
```

`ApiError`：`{ status: number, body: string }`，继承 `Error`。

| ApiRequestOptions | 类型 | 说明 |
|-------------------|------|------|
| `headers` | `Record<string, string>` | 本次请求自定义请求头 |
| `signal` | `AbortSignal` | 取消请求 |

---

## auth — 认证中间件

```tsx
import { createApp, auth } from 'weifuwu/client'

createApp()
  .use(auth())
  .mount('#root', App)

// 在组件中
function Profile(_props: {}, ctx: WfuiContext) {
  return (props) => {
    if (!ctx.auth?.isLoggedIn) return <p>请登录</p>
    return <p>欢迎, {ctx.auth?.user?.name}</p>
  }
}

// 登录
ctx.auth?.login(token, { id: 1, name: 'Alice' }, refreshToken)

// 登出
ctx.auth?.logout()

// 更新用户信息
ctx.auth?.setUser({ id: 1, name: 'Bob' })

// 刷新 token
await ctx.auth?.refresh()  // → boolean
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `storage` | `Storage` | `localStorage` | 存储方式 |
| `tokenKey` | `string` | `'weifuwu_token'` | Token 存储 key |
| `userKey` | `string` | `'weifuwu_user'` | 用户信息存储 key |
| `refreshTokenKey` | `string` | `'weifuwu_refresh'` | Refresh token 存储 key |
| `refreshEndpoint` | `string` | `'/api/auth/refresh'` | 刷新端点 |

| ctx.auth | 类型 | 说明 |
|----------|------|------|
| `.token` | `string \| null` | JWT token |
| `.user` | `any` | 用户对象 |
| `.isLoggedIn` | `boolean` | 是否已登录（基于 token 存在） |
| `.login(token, user, refreshToken?)` | `void` | 登录 |
| `.logout()` | `void` | 登出（清除存储） |
| `.setUser(user)` | `void` | 更新用户信息 |
| `.refresh()` | `Promise<boolean>` | 刷新 token（自动检测过期） |

启动时自动检测 token 是否过期（JWT `exp` 提前 30 秒），过期则自动调用 `refresh()`。

---

## ws — WebSocket 客户端中间件

```tsx
import { createApp, ws } from 'weifuwu/client'

createApp()
  .use(ws({ url: '/ws' }))
  .mount('#root', App)

// 发送消息
ctx.ws?.send({ type: 'chat', body: 'hello' })

// 接收消息 — 返回 unsubscribe 函数
const unsubscribe = ctx.ws?.onMessage((msg) => {
  console.log('收到:', msg)
})

// 清理
unsubscribe?.()
```

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | `string` | `'/ws'` | WebSocket 连接地址 |
| `reconnectInterval` | `number` | `3000` | 重连间隔（ms） |
| `maxReconnect` | `number` | `10` | 最大重连次数 |
| `pingInterval` | `number` | `30000` | 心跳发送间隔 |
| `pingTimeout` | `number` | `10000` | 心跳超时断开 |

| ctx.ws | 类型 | 说明 |
|--------|------|------|
| `.send(msg)` | `(unknown) => void` | 发送 JSON 消息 |
| `.onMessage(fn)` | `(fn) => () => void` | 订阅消息，返回 unsubscribe |
| `.isConnected` | `boolean` | 连接状态 |
| `.close()` | `() => void` | 断开连接 |

自动重连（指数退避）、心跳保活、JSON 序列化/反序列化。

---

## i18n — 国际化中间件

```tsx
import { createApp, i18n } from 'weifuwu/client'

createApp()
  .use(i18n({
    locale: 'zh-CN',
    messages: {
      'title': '仪表盘',
      'welcome': '欢迎光临',
    },
  }))
  .mount('#root', App)

// 组件中使用
<h1>{ctx.i18n?.t('title')}</h1>
<p>{ctx.i18n?.t('welcome')}</p>

// 运行时切换语言
ctx.i18n?.setLocale('en-US')
// → 自动触发根组件重渲染（所有组件使用新语言文案）
```

| I18nOptions | 类型 | 默认值 | 说明 |
|-------------|------|--------|------|
| `locale` | `string` | `'zh-CN'` | 初始语言 |
| `messages` | `Record<string, string>` | `{}` | 翻译键值对 |
| `components` | `Record<string, Record<string, string>>` | `{}` | 组件文案覆盖 |

| ctx.i18n | 类型 | 说明 |
|----------|------|------|
| `.t(key, fallback?)` | `(string, string?) => string` | 翻译 |
| `.locale` | `string` | 当前语言 |
| `.setLocale(lang)` | `(string) => void` | 切换语言（触发重渲染） |
| `.components` | `Record<string, Record<string, string>>` | 组件文案映射 |

内置语言包：

```ts
import { zhCN, enUS } from 'weifuwu/client'
```

- `zh-CN`：默认中文
- `en-US`：英文

组件文案（Button 的 `加载中...`、FileUpload 的 `点击或拖拽上传文件` 等）随语言自动切换。组件内部通过 `ctx.i18n?.components?.ComponentName.field` 读取。

组件支持 `props.locale` 局部覆盖语言。

---

## ErrorBoundary — 错误边界

```tsx
import { ErrorBoundary } from 'weifuwu/client'

<ErrorBoundary fallback={<p>出错了，请刷新页面</p>}>
  <UserProfile />
</ErrorBoundary>

// fallback 也可以是一个接收 error 的函数
<ErrorBoundary fallback={({ error }) => (
  <div>
    <p>出错了: {String(error)}</p>
    <button onClick={() => location.reload()}>重试</button>
  </div>
)}>
  <UserProfile />
</ErrorBoundary>
```

| ErrorBoundaryProps | 类型 | 默认值 | 说明 |
|--------------------|------|--------|------|
| `fallback` | `VNode \| ((props: { error }) => VNode) \| null` | `null` | 错误时渲染的内容 |
| `children` | `any` | — | 子组件 |

捕获子组件 render 时的错误 → 渲染 fallback。清除 `error` 即可重试。

---

## confirm — 确认对话框

两种用法，共享同一视觉与行为（基于 Modal 封装）：

**① 命令式 `ctx.confirm()`（推荐，操作前询问）**

```tsx
import { createApp } from 'weifuwu/client'
import { confirm } from 'weifuwu/components'

createApp()
  .use(confirm())
  .mount('#root', App)

// 任意代码中（组件事件、async 逻辑）
async function handleDelete(ctx: WfuiContext) {
  const ok = await ctx.confirm?.('确定删除这条记录？', {
    title: '确认删除',
    confirmText: '删除',
    cancelText: '取消',
    variant: 'danger',  // 'primary' | 'danger'
  })
  if (ok) {
    // 执行删除...
  }
}
```

**② 声明式 `<Confirm>`（需要受控状态时）**

```tsx
import { Confirm } from 'weifuwu/components'

<Confirm
  open={confirming}
  title="确认删除"
  message="确定删除这条记录？"
  confirmText="删除"
  variant="danger"
  onConfirm={() => doDelete()}
  onCancel={() => setConfirming(false)}
/>
```

| ConfirmOptions | 类型 | 默认值 | 说明 |
|----------------|------|--------|------|
| `title` | `string` | `'确认操作'` | 对话框标题 |
| `confirmText` | `string` | `'确定'` | 确认按钮文字 |
| `cancelText` | `string` | `'取消'` | 取消按钮文字 |
| `variant` | `'primary' \| 'danger'` | `'primary'` | 按钮样式变体 |
| `width` | `string` | Modal 默认 | 对话框宽度 |

- `ctx.confirm()` 返回 `Promise<boolean>`，ESC / 点击遮罩 / 取消 → resolve(false)
- 组件化渲染（Modal + portal），自动锁定滚动 + 焦点陷阱，i18n 文案可配置
- 多次调用各自独立渲染（叠放语义），互不干扰

---

## toast — 命令式消息提示

`ctx.toast()` 是 `<Toast>` 组件的全局命令式封装：任意代码中一行调用，自动消失、自动清理，无需宿主状态。

```tsx
import { createApp } from 'weifuwu/client'
import { toast } from 'weifuwu/components'

createApp()
  .use(toast({ position: 'top-right', duration: 3000, max: 3 }))
  .mount('#root', App)

// 任意代码中（组件事件、api 拦截器、WS 回调、定时器）
ctx.toast?.('保存成功', 'success')
ctx.toast?.('请求失败', 'error')
ctx.toast?.('普通消息')          // 默认 type = 'info'
```

| ToastOptions | 类型 | 默认值 | 说明 |
|-------------|------|--------|------|
| `position` | `ToastPosition` | `'top-right'` | 容器位置 |
| `duration` | `number` | `3000` | 默认自动消失时间（ms），0 = 不消失 |
| `max` | `number` | `3` | 最大显示条数，超出移除最早 |

单条可覆盖自动消失时间：`ctx.toast('慢一点消失', 'info', 5000)`。

与声明式 `<Toast toasts={...}/>` 共存：声明式用于局部列表（合并消息、自定义布局），命令式用于全局一次性反馈。

---

## ScrollLock / FocusTrap

```tsx
import { lockScroll, unlockScroll } from 'weifuwu/client'
import { trapFocus } from 'weifuwu/client'

// 锁定/解锁滚动（支持嵌套计数）
lockScroll()
unlockScroll()

// 焦点陷阱 — 返回 cleanup 函数
const cleanup = trapFocus(containerElement)
cleanup()  // 恢复之前的焦点
```

| API | 说明 |
|-----|------|
| `lockScroll()` | 锁定 body 滚动（iOS 兼容） |
| `unlockScroll()` | 解锁滚动，恢复滚动位置 |
| `trapFocus(el)` | Tab/Shift+Tab 在容器内循环，返回 cleanup |

---

## extendCtx — 上下文扩展

```tsx
import { extendCtx } from 'weifuwu/client'

// 在 AppMiddleware 中创建新 ctx，原 ctx getter 通过原型链继承
function myMw(ctx: WfuiContext): WfuiContext {
  return extendCtx(ctx, { myField: 'value' })
}
```

`extendCtx` 使用 `Object.create(ctx)` 保持原型链，再用 `Object.assign` 添加新字段。保证 getter 不被快照化。

---

