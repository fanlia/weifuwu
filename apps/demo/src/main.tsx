/**
 * weifuwu demo — 大型应用基础模板
 *
 * 展示 weifuwu/client 全部核心能力：
 *   signal / computed / effect / batch
 *   Show / For / ErrorBoundary / createPortal / wrap
 *   router / RouteView / Outlet（嵌套布局）
 *   ws / api / auth（通信 + 认证）
 *   useForm / createResource（表单 + 异步数据）
 */

import {
  signal, computed, Show, For, ErrorBoundary, createPortal, wrap,
  createApp, router, RouteView, Outlet,
  ws, api, auth, useForm, createResource,
} from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'

/* ===========================================================
 *                           首页
 * =========================================================== */

function HomePage(_props: {}, ctx: WfuiContext) {
  const features = signal([
    { title: 'Todo', desc: 'signal + Show/For 响应式列表', path: '/todo' },
    { title: '表单', desc: 'useForm 字段绑定/验证/提交', path: '/forms' },
    { title: '数据', desc: 'createResource + ErrorBoundary', path: '/data' },
    { title: 'Dashboard', desc: '嵌套布局 + lazy 代码分割', path: '/dashboard/overview' },
    { title: '认证', desc: 'api() + auth() 中间件', path: '/auth' },
    { title: '实时', desc: 'WebSocket 双向通信', path: '/ws' },
    { title: '关于', desc: '路由参数 /query', path: '/about' },
    { title: '用户', desc: '路由参数 /:name', path: '/user/wefu' },
  ])

  return (
    <div>
      <h1 class="text-3xl font-bold mb-2">weifuwu demo</h1>
      <p class="text-gray-500 mb-6">当前路径: <code class="bg-gray-100 px-2 py-0.5 rounded text-sm">{ctx.route.path}</code></p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <For each={features}>
          {(f) => (
            <div class="bg-white rounded-xl p-5 cursor-pointer shadow-sm hover:shadow-md transition-shadow border border-gray-100"
              onClick={() => ctx.app.navigate(f.path)}>
              <h3 class="font-semibold mb-1 text-base">{f.title}</h3>
              <p class="text-gray-400 text-sm">{f.desc}</p>
            </div>
          )}
        </For>
      </div>
    </div>
  )
}

/* ===========================================================
 *                   Todo — signal Show/For 演示
 * =========================================================== */

interface Todo { id: number; text: string; done: boolean }

const todos = signal<Todo[]>([
  { id: 1, text: '了解 signal', done: true },
  { id: 2, text: '写一个组件', done: true },
  { id: 3, text: '跑通 demo', done: false },
  { id: 4, text: '掌握 useForm', done: false },
  { id: 5, text: '熟悉嵌套布局', done: false },
])

const filter = signal<'all' | 'active' | 'done'>('all')
const input = signal('')

const filteredTodos = computed(() => {
  const f = filter.value
  return todos.value.filter(t => f === 'all' ? true : f === 'active' ? !t.done : t.done)
})
const remaining = computed(() => todos.value.filter(t => !t.done).length)
const isEmpty = computed(() => filteredTodos.value.length === 0)
const hasDone = computed(() => todos.value.some(t => t.done))

function addTodo() {
  const text = input.value.trim()
  if (!text) return
  todos.value = [...todos.value, { id: Date.now(), text, done: false }]
  input.value = ''
}
function toggleTodo(id: number) {
  todos.value = todos.value.map(t => t.id === id ? { ...t, done: !t.done } : t)
}
function clearDone() {
  todos.value = todos.value.filter(t => !t.done)
}

function TodoPage(_props: {}, _ctx: WfuiContext) {
  const filters: Array<{ key: 'all' | 'active' | 'done'; label: string }> = [
    { key: 'all', label: '全部' }, { key: 'active', label: '进行中' }, { key: 'done', label: '已完成' },
  ]

  return (
    <div>
      <h1 class="text-xl font-bold mb-4">Todo（{remaining}）</h1>
      <div class="flex gap-2 mb-4">
        <input class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={input} onInput={(e: any) => input.value = e.target.value}
          onKeyDown={(e: any) => e.key === 'Enter' && addTodo()} placeholder="添加待办..." />
        <button class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 font-medium" onClick={addTodo}>添加</button>
      </div>
      <div class="flex gap-2 mb-4">
        {filters.map(f => (
          <button class={computed(() => {
            const base = 'px-3 py-1 border rounded-full text-sm cursor-pointer transition-colors font-medium'
            return filter.value === f.key
              ? base + ' bg-blue-500 text-white border-blue-500'
              : base + ' bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          })}
            onClick={() => filter.value = f.key}>{f.label}</button>
        ))}
      </div>
      <div class="mb-4">
        <Show when={isEmpty} fallback={
          <For each={filteredTodos}>
            {(todo) => (
              <div class={`flex items-center gap-3 py-2.5 border-b border-gray-100 ${todo.done ? 'opacity-50' : ''}`}>
                <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} class="cursor-pointer w-4 h-4 accent-blue-500" />
                <span class={todo.done ? 'line-through text-gray-400' : 'text-gray-700'}>{todo.text}</span>
              </div>
            )}
          </For>
        }>
          <p class="text-gray-400 text-center py-8 text-sm">暂无待办 🎉</p>
        </Show>
      </div>
      <Show when={hasDone}>
        <button class="px-4 py-1.5 bg-red-500 text-white rounded-lg text-sm cursor-pointer hover:bg-red-600 font-medium" onClick={clearDone}>清除已完成</button>
      </Show>
    </div>
  )
}

/* ===========================================================
 *               表单 — useForm 演示
 * =========================================================== */

function FormPage(_props: {}, _ctx: WfuiContext) {
  const form = useForm({
    initial: { username: '', email: '', password: '', bio: '' },
    validate: {
      username: (v) => !v ? '请输入用户名' : v.length < 3 ? '至少 3 个字符' : null,
      email: [
        (v) => !v ? '请输入邮箱' : null,
        (v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '邮箱格式不正确' : null,
      ],
      password: (v) => !v ? '请输入密码' : v.length < 6 ? '至少 6 位' : null,
    },
    onSubmit: async (values) => {
      // 模拟提交
      await new Promise(r => setTimeout(r, 1000))
      console.log('提交成功:', values)
    },
  })

  const submitted = signal(false)

  // 监听提交成功
  // 实际项目中这里会用 effect 或 createResource

  return (
    <div class="max-w-lg">
      <h1 class="text-xl font-bold mb-1">注册表单</h1>
      <p class="text-gray-400 text-sm mb-5">演示 useForm：字段绑定、验证、提交状态</p>

      <Show when={submitted} fallback={
        <form onSubmit={(e: Event) => {
          // 包装 handleSubmit 以显示成功消息
          const prevOnSubmit = form.handleSubmit
          // 我们重写 onSubmit 来演示提交成功状态
          const origSubmit = form.handleSubmit
          e.preventDefault()
          if (form.submitting.value) return
          // 标记所有字段已触碰
          const allTouched = {} as any
          for (const k of Object.keys(form.values.value)) allTouched[k] = true
          form.touched.value = allTouched
          // 验证
          if (!form.validateAll()) return
          form.submitting.value = true
          setTimeout(() => {
            form.submitting.value = false
            submitted.value = true
            setTimeout(() => submitted.value = false, 3000)
          }, 1000)
        }} class="space-y-4">
          {/* 用户名 */}
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
            <input {...form.field('username')}
              class={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                form.errors.value.username && form.touched.value.username ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="至少 3 个字符" />
            <Show when={form.errors.value.username && form.touched.value.username}>
              <p class="text-red-500 text-xs mt-1">{form.errors.value.username}</p>
            </Show>
          </div>

          {/* 邮箱 */}
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input {...form.field('email')}
              class={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                form.errors.value.email && form.touched.value.email ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="name@example.com" />
            <Show when={form.errors.value.email && form.touched.value.email}>
              <p class="text-red-500 text-xs mt-1">{form.errors.value.email}</p>
            </Show>
          </div>

          {/* 密码 */}
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input type="password" {...form.field('password')}
              class={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                form.errors.value.password && form.touched.value.password ? 'border-red-400' : 'border-gray-300'}`}
              placeholder="至少 6 位" />
            <Show when={form.errors.value.password && form.touched.value.password}>
              <p class="text-red-500 text-xs mt-1">{form.errors.value.password}</p>
            </Show>
          </div>

          {/* 简介 */}
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">简介（可选）</label>
            <textarea {...form.field('bio')}
              class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              rows={3} placeholder="介绍一下自己..." />
          </div>

          <button type="submit" disabled={form.submitting}
            class="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer
                   hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <Show when={form.submitting} fallback={<span>提交注册</span>}>
              <span>提交中...</span>
            </Show>
          </button>
        </form>
      }>
        <div class="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <p class="text-green-700 text-lg font-medium">✅ 注册成功！</p>
          <p class="text-green-600 text-sm mt-2">3 秒后自动关闭</p>
        </div>
      </Show>
    </div>
  )
}

/* ===========================================================
 *           异步数据 — createResource + ErrorBoundary 演示
 * =========================================================== */

function fetchPosts() {
  return fetch('/api/posts').then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
}

function DataPage(_props: {}, _ctx: WfuiContext) {
  // createResource 自动管理 loading/error/data
  const [posts, { loading, error, refetch }] = createResource(fetchPosts)

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold">文章列表</h1>
        <button class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm cursor-pointer hover:bg-gray-200 transition-colors"
          onClick={refetch}>刷新</button>
      </div>
      <p class="text-gray-400 text-sm mb-4">演示 createResource：自动管理 loading/error/data 信号</p>

      {/* 加载状态 */}
      <Show when={loading}>
        <div class="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} class="bg-white rounded-xl p-5 shadow-sm animate-pulse">
              <div class="h-4 bg-gray-200 rounded w-2/3 mb-3" />
              <div class="h-3 bg-gray-100 rounded w-full mb-2" />
              <div class="h-3 bg-gray-100 rounded w-4/5" />
            </div>
          ))}
        </div>
      </Show>

      {/* 错误状态 — ErrorBoundary 演示 */}
      <ErrorBoundary
        fallback={(e) => (
          <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <p class="text-red-600 font-medium">加载失败</p>
            <p class="text-red-500 text-sm mt-1">{e.message}</p>
            <button class="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg text-sm cursor-pointer hover:bg-red-600"
              onClick={refetch}>重试</button>
          </div>
        )}
        onError={(e) => console.error('DataPage Error:', e)}>
        {() => (
          <>
            {/* 数据就绪 */}
            <Show when={!loading && !error.value}>
              <div class="space-y-3">
                <For each={posts}>
                  {(post: any) => (
                    <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                      <h3 class="font-semibold text-base mb-1">{post.title}</h3>
                      <p class="text-gray-500 text-sm leading-relaxed">{post.body}</p>
                      <div class="mt-2 text-xs text-gray-400">{post.author} · {post.date}</div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </>
        )}
      </ErrorBoundary>
    </div>
  )
}

/* ===========================================================
 *         Dashboard — 嵌套布局 + 代码分割（lazy） 演示
 * =========================================================== */

// 直接导入（可用于实际代码分割：
//   const Overview = lazy(() => import('./pages/DashboardOverview'))
// 配合 esbuild splitting:true + outdir 使用）
import DashboardOverview from './pages/DashboardOverview.tsx'
import DashboardSettings from './pages/DashboardSettings.tsx'

function DashboardLayout(_props: {}, ctx: WfuiContext) {
  const tab = computed(() => ctx.route.path.includes('settings') ? 'settings' : 'overview')

  return (
    <div class="flex gap-6">
      {/* 侧边栏 — 路由切换时保持挂载 */}
      <div class="w-48 shrink-0">
        <h2 class="font-bold text-sm text-gray-400 uppercase tracking-wider mb-3">Dashboard</h2>
        <div class="space-y-1">
          {[
            { label: '概览', path: '/dashboard/overview' },
            { label: '设置', path: '/dashboard/settings' },
          ].map(item => (
            <div class={`px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
              tab.value === (item.path.includes('settings') ? 'settings' : 'overview')
                ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => ctx.app.navigate(item.path)}>
              {item.label}
            </div>
          ))}
        </div>
      </div>
      {/* 内容区 — 只替换 Outlet 区域 */}
      <div class="flex-1">
        <Outlet />
      </div>
    </div>
  )
}

/* ===========================================================
 *               认证 — api() + auth() 中间件 演示
 * =========================================================== */

function AuthPage(_props: {}, ctx: WfuiContext) {
  const email = signal('')
  const password = signal('')
  const loginError = signal<string | null>(null)

  const handleLogin = async () => {
    loginError.value = null
    try {
      const res = await ctx.api.post<{ token: string; user: { id: number; name: string; email: string } }>('/api/login', {
        email: email.value,
        password: password.value,
      })
      ctx.auth.login(res.token, res.user)
    } catch (e: any) {
      loginError.value = e.message || '登录失败'
    }
  }

  return (
    <div class="max-w-md">
      <h1 class="text-xl font-bold mb-1">认证演示</h1>
      <p class="text-gray-400 text-sm mb-5">演示 api() + auth() 中间件：登录/登出/token 管理</p>

      <Show when={ctx.auth.isLoggedIn} fallback={
        <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 class="font-semibold mb-4">登录</h2>
          <div class="space-y-3">
            <input class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={email} onInput={(e: any) => email.value = e.target.value}
              placeholder="邮箱 (任意)" />
            <input type="password" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={password} onInput={(e: any) => password.value = e.target.value}
              onKeyDown={(e: any) => e.key === 'Enter' && handleLogin()}
              placeholder="密码 (任意)" />
            <Show when={loginError.value}>
              <p class="text-red-500 text-sm">{loginError.value}</p>
            </Show>
            <button class="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-600 transition-colors"
              onClick={handleLogin}>登录</button>
          </div>
        </div>
      }>
        <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
              {ctx.auth.user.value?.name?.[0] ?? '?'}
            </div>
            <div>
              <p class="font-semibold">{ctx.auth.user.value?.name}</p>
              <p class="text-gray-400 text-sm">{ctx.auth.user.value?.email}</p>
            </div>
          </div>
          <div class="bg-gray-50 rounded-lg p-3 mb-4">
            <p class="text-xs text-gray-500 mb-1">Token</p>
            <code class="text-xs text-gray-700 break-all">{ctx.auth.token.value?.slice(0, 40)}...</code>
          </div>
          <button class="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-red-600 transition-colors"
            onClick={() => ctx.auth.logout()}>退出登录</button>
        </div>
      </Show>
    </div>
  )
}

/* ===========================================================
 *             WebSocket 实时通信 — ws() 中间件演示
 * =========================================================== */

function RealtimePage(_props: {}, ctx: WfuiContext) {
  const messages = signal<Array<{ type: string; body: string; ts?: number }>>([])
  const wsInput = signal('')

  ctx.ws.onMessage((data: any) => {
    messages.value = [...messages.value, data]
  })

  const send = () => {
    const text = wsInput.value.trim()
    if (!text) return
    ctx.ws.send({ body: text })
    wsInput.value = ''
  }

  return (
    <div>
      <h1 class="text-xl font-bold mb-1">WebSocket 实时通信</h1>
      <p class="text-gray-400 text-sm mb-4">演示 ws() 中间件：自动重连、消息收发</p>
      <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <p class="mb-3 flex items-center gap-2">
          连接状态：
          <Show when={ctx.ws.isConnected} fallback={<span class="text-red-500 text-sm font-medium">未连接</span>}>
            <span class="text-green-600 text-sm font-medium">🟢 已连接</span>
          </Show>
        </p>

        <div class="max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-3 mb-4 bg-gray-50">
          <Show when={messages.value.length > 0} fallback={
            <p class="text-gray-400 text-center py-8 text-sm">暂无消息，发送一条试试</p>
          }>
            <For each={messages}>
              {(msg) => (
                <div class={`p-2 my-1.5 rounded-lg text-sm ${
                  msg.type === 'system' ? 'bg-green-50 text-green-700'
                    : msg.type === 'echo' ? 'bg-blue-50 text-blue-700'
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  <strong>{msg.type === 'system' ? '系统' : msg.type === 'echo' ? '回显' : '消息'}:</strong>{' '}
                  {msg.body}
                  {msg.ts ? <span class="text-gray-400 text-xs ml-2">{new Date(msg.ts).toLocaleTimeString()}</span> : null}
                </div>
              )}
            </For>
          </Show>
        </div>

        <div class="flex gap-2">
          <input class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={wsInput} onInput={(e: any) => wsInput.value = e.target.value}
            onKeyDown={(e: any) => e.key === 'Enter' && send()}
            placeholder="输入消息，回车发送..." />
          <button class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 font-medium transition-colors"
            onClick={send}>发送</button>
        </div>
      </div>
    </div>
  )
}

/* ===========================================================
 *              关于 + 用户 — 路由参数演示（保留原有）
 * =========================================================== */

function AboutPage(_props: {}, ctx: WfuiContext) {
  return (
    <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h1 class="text-xl font-bold mb-3">关于 weifuwu</h1>
      <ul class="pl-5 mb-3 text-gray-600 space-y-1">
        <li>核心: signal + TSX + (props, ctx)</li>
        <li>无 VDOM，无 hooks 规则，零依赖</li>
        <li>前后端共享 ctx 理念</li>
        <li>一个 npm 包打通全栈</li>
      </ul>
      <div class="border-t border-gray-100 pt-3 mt-3">
        <p><strong>路由参数:</strong> {JSON.stringify(ctx.route.params)}</p>
        <p><strong>查询参数:</strong> {JSON.stringify(ctx.route.query)}</p>
      </div>
      <div class="mt-4 flex gap-2 flex-wrap">
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app.navigate('/about?tab=intro')}>?tab=intro</button>
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app.navigate('/about?tab=api&version=1')}>?tab=api&version=1</button>
        <button class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm cursor-pointer hover:bg-gray-200 transition-colors"
          onClick={() => ctx.app.navigate('/todo')}>去 Todo</button>
      </div>
    </div>
  )
}

function UserPage(_props: {}, ctx: WfuiContext) {
  return (
    <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h1 class="text-xl font-bold mb-3">用户: {ctx.route.params.name}</h1>
      <p class="mb-1 text-gray-600">路径: <code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{ctx.route.path}</code></p>
      <p class="mb-4 text-gray-600">所有参数: <code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{JSON.stringify(ctx.route.params)}</code></p>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app.navigate('/user/alice')}>alice</button>
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app.navigate('/user/bob')}>bob</button>
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app.navigate('/user/张三')}>张三</button>
      </div>
    </div>
  )
}

/* ===========================================================
 *                    404
 * =========================================================== */

function NotFound(_props: {}, ctx: WfuiContext) {
  return (
    <div class="text-center py-16">
      <h1 class="text-6xl text-gray-200 font-bold">404</h1>
      <p class="my-3 text-gray-400">路径 <code class="bg-gray-100 px-2 py-0.5 rounded">{ctx.route.path}</code> 未找到</p>
      <button class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
        onClick={() => ctx.app.navigate('/')}>回首页</button>
    </div>
  )
}

/* ===========================================================
 *                   应用布局 + 路由
 * =========================================================== */

function AppShell(_props: {}, ctx: WfuiContext) {
  const navItems = [
    { label: '首页', path: '/' },
    { label: 'Todo', path: '/todo' },
    { label: '表单', path: '/forms' },
    { label: '数据', path: '/data' },
    { label: 'Dashboard', path: '/dashboard/overview' },
    { label: '认证', path: '/auth' },
    { label: '实时', path: '/ws' },
  ]

  return (
    <div class="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <nav class="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div class="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div class="flex items-center gap-1">
            <span class="font-bold text-lg cursor-pointer text-blue-500 hover:text-blue-600 transition-colors"
              onClick={() => ctx.app.navigate('/')}>weifuwu</span>
            <span class="text-xs text-gray-300 ml-1">demo</span>
          </div>
          <div class="flex items-center gap-1">
            <For each={navItems}>
              {(item) => (
                <span class="px-3 py-1.5 text-sm text-gray-500 hover:text-blue-500 cursor-pointer rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => ctx.app.navigate(item.path)}>
                  {item.label}
                </span>
              )}
            </For>
            {/* 认证状态指示器 */}
            <Show when={ctx.auth?.isLoggedIn}>
              <span class="ml-2 w-2 h-2 rounded-full bg-green-500" title="已登录" />
            </Show>
          </div>
        </div>
      </nav>

      {/* 主内容区 */}
      <main class="max-w-5xl mx-auto px-4 py-6">
        <RouteView />
      </main>
    </div>
  )
}

// ── 路由配置 ─────────────────────────────────────────────

const routes: RouteDef[] = [
  { path: '/', component: HomePage, title: '首页' },
  { path: '/todo', component: TodoPage, title: 'Todo' },
  { path: '/forms', component: FormPage, title: '表单' },
  { path: '/data', component: DataPage, title: '异步数据' },
  {
    path: '/dashboard',
    layout: DashboardLayout,
    title: 'Dashboard',
    children: [
      { path: '/overview', component: DashboardOverview, title: '概览' },
      { path: '/settings', component: DashboardSettings, title: '设置' },
    ],
  },
  { path: '/auth', component: AuthPage, title: '认证' },
  { path: '/ws', component: RealtimePage, title: '实时' },
  { path: '/about', component: AboutPage, title: '关于' },
  { path: '/user/:name', component: UserPage, title: '用户' },
]

// ── SSR Like Button ─────────────────────────────────────

function LikeButton(_props: {}, _ctx: WfuiContext): Node {
  const count = signal(0)
  return (
    <button onClick={() => count.value++}
      class="px-5 py-2 border border-gray-300 rounded-lg bg-white cursor-pointer text-base hover:bg-gray-50 transition-colors">
      ❤️ {count}
    </button>
  )
}

// ── 启动 ────────────────────────────────────────────────

const app = createApp()
app.use(api({ baseURL: '' }))
app.use(auth())
app.use(ws())
app.use(router({ routes, notFound: NotFound, mode: 'hash', scrollRestoration: true }))

// 检测 SSR 页面
const root = document.getElementById('root')
const hasSsr = root && root.children.length > 0

if (hasSsr) {
  const likeTarget = document.querySelector('[data-hydrate="like"]')
  if (likeTarget) app.hydrate('[data-hydrate="like"]', LikeButton)
} else {
  app.mount('#root', AppShell)
}
