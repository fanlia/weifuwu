/**
 * weifuwu demo — 迁移到新 VDOM + Proxy 架构
 *
 * 核心模式：
 *   ctx.ui.$  →  状态（深度 Proxy：$.x=val / $.items.push / $.items[0].x=y 自动渲染）
 *   三元 + .map()  →  条件/列表
 *   if (!ready) { fetch }  →  异步数据
 *   ref  →  生命周期
 */

import { createApp, router, RouteView, ws, api, auth } from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'
import DashboardOverview from './pages/DashboardOverview'
import DashboardSettings from './pages/DashboardSettings'

/* ═══════════════════════════════════════════════════════
 *  首页
 * ═══════════════════════════════════════════════════════ */

function HomePage(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  return (
    <div>
      <h1 class="text-3xl font-bold mb-2">weifuwu demo</h1>
      <p class="text-gray-500 mb-6">当前路径: <code class="bg-gray-100 px-2 py-0.5 rounded text-sm">{ctx.route?.path}</code></p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        {$.features.map((f: any) => (
          <div key={f.path} class="bg-white rounded-xl p-5 cursor-pointer shadow-sm hover:shadow-md transition-shadow border border-gray-100"
            onClick={() => ctx.app?.navigate(f.path)}>
            <h3 class="font-semibold mb-1 text-base">{f.title}</h3>
            <p class="text-gray-400 text-sm">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  Todo
 * ═══════════════════════════════════════════════════════ */

function TodoPage(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  const todos = $.todos
  const filter = $.filter
  const filteredTodos = todos.filter((t: any) => filter === 'all' ? true : filter === 'active' ? !t.done : t.done)
  const remaining = todos.filter((t: any) => !t.done).length
  const hasDone = todos.some((t: any) => t.done)
  const isEmpty = filteredTodos.length === 0
  const filters = [
    { key: 'all' as const, label: '全部' },
    { key: 'active' as const, label: '进行中' },
    { key: 'done' as const, label: '已完成' },
  ]

  function addTodo() {
    const text = $.input.trim()
    if (!text) return
    $.todos = [...todos, { id: Date.now(), text, done: false }]
    $.input = ''
  }

  function toggleTodo(id: number) {
    $.todos = todos.map((t: any) => t.id === id ? { ...t, done: !t.done } : t)
  }

  function clearDone() {
    $.todos = todos.filter((t: any) => !t.done)
  }

  return (
    <div>
      <h1 class="text-xl font-bold mb-4">Todo（{remaining}）</h1>
      <div class="flex gap-2 mb-4">
        <input class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={$.input} onInput={(e: any) => { $.input = e.target.value }}
          onKeyDown={(e: any) => e.key === 'Enter' && addTodo()} placeholder="添加待办..." />
        <button class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 font-medium" onClick={addTodo}>添加</button>
      </div>
      <div class="flex gap-2 mb-4">
        {filters.map(f => (
          <button key={f.key}
            class={`px-3 py-1 border rounded-full text-sm cursor-pointer transition-colors font-medium ${filter === f.key ? 'bg-blue-500 text-white border-blue-500' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
            onClick={() => { $.filter = f.key }}>{f.label}</button>
        ))}
      </div>
      <div class="mb-4">
        {isEmpty ? (
          <p class="text-gray-400 text-center py-8 text-sm">暂无待办 🎉</p>
        ) : (
          filteredTodos.map((todo: any) => (
            <div key={todo.id} class={`flex items-center gap-3 py-2.5 border-b border-gray-100 ${todo.done ? 'opacity-50' : ''}`}>
              <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} class="cursor-pointer w-4 h-4 accent-blue-500" />
              <span class={todo.done ? 'line-through text-gray-400' : 'text-gray-700'}>{todo.text}</span>
            </div>
          ))
        )}
      </div>
      {hasDone && (
        <button class="px-4 py-1.5 bg-red-500 text-white rounded-lg text-sm cursor-pointer hover:bg-red-600 font-medium" onClick={clearDone}>清除已完成</button>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  表单
 * ═══════════════════════════════════════════════════════ */

function FormPage(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!$.username) errs.username = '请输入用户名'
    else if ($.username.length < 3) errs.username = '至少 3 个字符'
    if (!$.email) errs.email = '请输入邮箱'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($.email)) errs.email = '邮箱格式不正确'
    if (!$.password) errs.password = '请输入密码'
    else if ($.password.length < 6) errs.password = '至少 6 位'
    $.errors = errs
    return Object.keys(errs).length === 0
  }

  function handleSubmit(e: Event) {
    e.preventDefault()
    if ($.submitting) return
    // 标记所有字段已触碰
    $.errors = { ...$.errors, username: $.errors.username || '', email: $.errors.email || '', password: $.errors.password || '' }
    if (!validate()) return
    $.submitting = true
    setTimeout(() => {
      $.submitting = false
      $.submitted = true
      setTimeout(() => { $.submitted = false }, 3000)
    }, 1000)
  }

  if ($.submitted) {
    return (
      <div class="max-w-lg">
        <h1 class="text-xl font-bold mb-1">注册表单</h1>
        <p class="text-gray-400 text-sm mb-5">演示手动表单：字段绑定、验证、提交状态</p>
        <div class="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <p class="text-green-700 text-lg font-medium">✅ 注册成功！</p>
          <p class="text-green-600 text-sm mt-2">3 秒后自动关闭</p>
        </div>
      </div>
    )
  }

  return (
    <div class="max-w-lg">
      <h1 class="text-xl font-bold mb-1">注册表单</h1>
      <p class="text-gray-400 text-sm mb-5">演示手动表单：字段绑定、验证、提交状态</p>

      <form onSubmit={handleSubmit} class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">用户名</label>
          <input value={$.username} onInput={(e: any) => { $.username = e.target.value }}
            class={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${$.errors.username ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="至少 3 个字符" />
          {$.errors.username && <p class="text-red-500 text-xs mt-1">{$.errors.username}</p>}
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
          <input value={$.email} onInput={(e: any) => { $.email = e.target.value }}
            class={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${$.errors.email ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="name@example.com" />
          {$.errors.email && <p class="text-red-500 text-xs mt-1">{$.errors.email}</p>}
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input type="password" value={$.password} onInput={(e: any) => { $.password = e.target.value }}
            class={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${$.errors.password ? 'border-red-400' : 'border-gray-300'}`}
            placeholder="至少 6 位" />
          {$.errors.password && <p class="text-red-500 text-xs mt-1">{$.errors.password}</p>}
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">简介（可选）</label>
          <textarea value={$.bio} onInput={(e: any) => { $.bio = e.target.value }}
            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={3} placeholder="介绍一下自己..." />
        </div>

        <button type="submit" disabled={$.submitting}
          class="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {$.submitting ? '提交中...' : '提交注册'}
        </button>
      </form>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  异步数据
 * ═══════════════════════════════════════════════════════ */

function fetchPosts() {
  return fetch('/api/posts').then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
}

function DataPage(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  function refetch() {
    $.loading = true; $.error = null
    fetchPosts().then(data => {
      $.posts = data; $.loading = false
    }).catch(e => {
      $.error = e; $.loading = false
    })
  }

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-bold">文章列表</h1>
        <button class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm cursor-pointer hover:bg-gray-200 transition-colors"
          onClick={refetch}>刷新</button>
      </div>
      <p class="text-gray-400 text-sm mb-4">演示 if (!ready) + fetch：自动管理 loading/error/data</p>

      {$.loading && (
        <div class="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} class="bg-white rounded-xl p-5 shadow-sm animate-pulse">
              <div class="h-4 bg-gray-200 rounded w-2/3 mb-3" />
              <div class="h-3 bg-gray-100 rounded w-full mb-2" />
              <div class="h-3 bg-gray-100 rounded w-4/5" />
            </div>
          ))}
        </div>
      )}

      {$.error && (
        <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p class="text-red-600 font-medium">加载失败</p>
          <p class="text-red-500 text-sm mt-1">{$.error.message}</p>
          <button class="mt-3 px-4 py-2 bg-red-500 text-white rounded-lg text-sm cursor-pointer hover:bg-red-600"
            onClick={refetch}>重试</button>
        </div>
      )}

      {!$.loading && !$.error && (
        <div class="space-y-3">
          {$.posts.map((post: any) => (
            <div key={post.id} class="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
              <h3 class="font-semibold text-base mb-1">{post.title}</h3>
              <p class="text-gray-500 text-sm leading-relaxed">{post.body}</p>
              <div class="mt-2 text-xs text-gray-400">{post.author} · {post.date}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  Dashboard — 嵌套布局
 * ═══════════════════════════════════════════════════════ */

function DashboardLayout(_props: {}, ctx: WfuiContext) {
  const tab = ctx.route?.path?.includes('settings') ? 'settings' : 'overview'

  return (
    <div class="flex gap-6">
      <div class="w-48 shrink-0">
        <h2 class="font-bold text-sm text-gray-400 uppercase tracking-wider mb-3">Dashboard</h2>
        <div class="space-y-1">
          {[
            { label: '概览', path: '/dashboard/overview' },
            { label: '设置', path: '/dashboard/settings' },
          ].map(item => (
            <div key={item.path}
              class={`px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${tab === (item.path.includes('settings') ? 'settings' : 'overview') ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
              onClick={() => ctx.app?.navigate(item.path)}>
              {item.label}
            </div>
          ))}
        </div>
      </div>
      <div class="flex-1">
        <RouteView />
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  认证 — api() + auth() 中间件演示
 * ═══════════════════════════════════════════════════════ */

function AuthPage(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  async function handleLogin() {
    $.loginError = null
    try {
      const res: any = await (ctx.api as any).post('/api/login', {
        email: $.email,
        password: $.password,
      })
      ctx.auth?.login(res.token, res.user)
    } catch (e: any) {
      $.loginError = e.message || '登录失败'
    }
  }

  return (
    <div class="max-w-md">
      <h1 class="text-xl font-bold mb-1">认证演示</h1>
      <p class="text-gray-400 text-sm mb-5">演示 api() + auth() 中间件：登录/登出/token 管理</p>

      {ctx.auth?.isLoggedIn ? (
        <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div class="flex items-center gap-3 mb-4">
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
              {(ctx.auth?.user?.name?.[0] ?? '?').toUpperCase()}
            </div>
            <div>
              <p class="font-semibold">{ctx.auth?.user?.name}</p>
              <p class="text-gray-400 text-sm">{ctx.auth?.user?.email}</p>
            </div>
          </div>
          <div class="bg-gray-50 rounded-lg p-3 mb-4">
            <p class="text-xs text-gray-500 mb-1">Token</p>
            <code class="text-xs text-gray-700 break-all">{ctx.auth?.token?.slice(0, 40)}...</code>
          </div>
          <button class="w-full py-2 bg-red-500 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-red-600 transition-colors"
            onClick={() => ctx.auth?.logout()}>退出登录</button>
        </div>
      ) : (
        <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 class="font-semibold mb-4">登录</h2>
          <div class="space-y-3">
            <input class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={$.email} onInput={(e: any) => { $.email = e.target.value }}
              placeholder="邮箱 (任意)" />
            <input type="password" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={$.password} onInput={(e: any) => { $.password = e.target.value }}
              onKeyDown={(e: any) => e.key === 'Enter' && handleLogin()}
              placeholder="密码 (任意)" />
            {$.loginError && <p class="text-red-500 text-sm">{$.loginError}</p>}
            <button class="w-full py-2.5 bg-blue-500 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-600 transition-colors"
              onClick={handleLogin}>登录</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  WebSocket 实时通信
 * ═══════════════════════════════════════════════════════ */

function RealtimePage(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$

  function send() {
    const text = $.wsInput.trim()
    if (!text) return
    ctx.ws?.send({ body: text })
    $.wsInput = ''
  }

  return (
    <div>
      <h1 class="text-xl font-bold mb-1">WebSocket 实时通信</h1>
      <p class="text-gray-400 text-sm mb-4">演示 ws() 中间件：自动重连、消息收发</p>
      <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <p class="mb-3 flex items-center gap-2">
          连接状态：
          {ctx.ws?.isConnected ? (
            <span class="text-green-600 text-sm font-medium">🟢 已连接</span>
          ) : (
            <span class="text-red-500 text-sm font-medium">未连接</span>
          )}
        </p>

        <div class="max-h-72 overflow-y-auto border border-gray-200 rounded-lg p-3 mb-4 bg-gray-50">
          {$.messages.map((msg: any, i: number) => (
            <div key={i} class={`p-2 my-1.5 rounded-lg text-sm ${msg.type === 'system' ? 'bg-green-50 text-green-700' : msg.type === 'echo' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-700'}`}>
              <strong>{msg.type === 'system' ? '系统' : msg.type === 'echo' ? '回显' : '消息'}:</strong>{' '}
              {msg.body}
              {msg.ts ? <span class="text-gray-400 text-xs ml-2">{new Date(msg.ts).toLocaleTimeString()}</span> : null}
            </div>
          ))}
          {$.messages.length === 0 && <p class="text-gray-400 text-center py-8 text-sm">暂无消息，发送一条试试</p>}
        </div>

        <div class="flex gap-2">
          <input class="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={$.wsInput} onInput={(e: any) => { $.wsInput = e.target.value }}
            onKeyDown={(e: any) => e.key === 'Enter' && send()}
            placeholder="输入消息，回车发送..." />
          <button class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 font-medium transition-colors"
            onClick={send}>发送</button>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  关于 + 用户 — 路由参数演示
 * ═══════════════════════════════════════════════════════ */

function AboutPage(_props: {}, ctx: WfuiContext) {
  return (
    <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h1 class="text-xl font-bold mb-3">关于 weifuwu</h1>
      <ul class="pl-5 mb-3 text-gray-600 space-y-1">
        <li>核心: VDOM + Proxy + (props, ctx)</li>
        <li>无 signal，无 hooks 规则，零依赖</li>
        <li>前后端共享 ctx 理念</li>
        <li>一个 npm 包打通全栈</li>
      </ul>
      <div class="border-t border-gray-100 pt-3 mt-3">
        <p><strong>路由参数:</strong> {JSON.stringify(ctx.route?.params)}</p>
        <p><strong>查询参数:</strong> {JSON.stringify(ctx.route?.query)}</p>
      </div>
      <div class="mt-4 flex gap-2 flex-wrap">
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app?.navigate('/about?tab=intro')}>?tab=intro</button>
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app?.navigate('/about?tab=api&version=1')}>?tab=api&version=1</button>
        <button class="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm cursor-pointer hover:bg-gray-200 transition-colors"
          onClick={() => ctx.app?.navigate('/todo')}>去 Todo</button>
      </div>
    </div>
  )
}

function UserPage(_props: {}, ctx: WfuiContext) {
  return (
    <div class="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <h1 class="text-xl font-bold mb-3">用户: {ctx.route?.params?.name}</h1>
      <p class="mb-1 text-gray-600">路径: <code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{ctx.route?.path}</code></p>
      <p class="mb-4 text-gray-600">所有参数: <code class="bg-gray-100 px-1.5 py-0.5 rounded text-sm">{JSON.stringify(ctx.route?.params)}</code></p>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app?.navigate('/user/alice')}>alice</button>
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app?.navigate('/user/bob')}>bob</button>
        <button class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
          onClick={() => ctx.app?.navigate('/user/张三')}>张三</button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  404
 * ═══════════════════════════════════════════════════════ */

function NotFound(_props: {}, ctx: WfuiContext) {
  return (
    <div class="text-center py-16">
      <h1 class="text-6xl text-gray-200 font-bold">404</h1>
      <p class="my-3 text-gray-400">路径 <code class="bg-gray-100 px-2 py-0.5 rounded">{ctx.route?.path}</code> 未找到</p>
      <button class="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm cursor-pointer hover:bg-blue-600 transition-colors"
        onClick={() => ctx.app?.navigate('/')}>回首页</button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  应用布局 + 路由
 * ═══════════════════════════════════════════════════════ */

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
      <nav class="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div class="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
          <div class="flex items-center gap-1">
            <span class="font-bold text-lg cursor-pointer text-blue-500 hover:text-blue-600 transition-colors"
              onClick={() => ctx.app?.navigate('/')}>weifuwu</span>
            <span class="text-xs text-gray-300 ml-1">demo</span>
          </div>
          <div class="flex items-center gap-1">
            {navItems.map(item => (
              <span key={item.path}
                class="px-3 py-1.5 text-sm text-gray-500 hover:text-blue-500 cursor-pointer rounded-lg hover:bg-gray-50 transition-colors"
                onClick={() => ctx.app?.navigate(item.path)}>
                {item.label}
              </span>
            ))}
            {ctx.auth?.isLoggedIn && (
              <span class="ml-2 w-2 h-2 rounded-full bg-green-500" title="已登录" />
            )}
          </div>
        </div>
      </nav>

      <main class="max-w-5xl mx-auto px-4 py-6">
        <RouteView />
      </main>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
 *  路由配置
 * ═══════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════
 *  启动
 * ═══════════════════════════════════════════════════════ */

const app = createApp()
app.use(api({ baseURL: '' }))
app.use(auth())
app.use(ws())
app.use(router({ routes, notFound: NotFound, mode: 'history' }))
app.mount('#root', AppShell)
