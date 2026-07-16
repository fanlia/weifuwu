/**
 * 演示 wefu 路由 + signal + (props, ctx) + Show/For
 */

import { signal, computed, Show, For, createApp, api, auth, router, RouteView } from 'weifuwu/client'
import type { WfuiContext, RouteDef } from 'weifuwu/client'

// ═══════════════════════════════════════════════════════════
// Todo 页面
// ═══════════════════════════════════════════════════════════

interface Todo { id: number; text: string; done: boolean }

const todos = signal<Todo[]>([
  { id: 1, text: '了解 signal', done: true },
  { id: 2, text: '写一个组件', done: true },
  { id: 3, text: '跑通 demo', done: false },
  { id: 4, text: '集成 weifuwu', done: false },
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

function TodoItem({ todo }: { todo: Todo }, _ctx: WfuiContext) {
  return (
    <div class={`todo-item ${todo.done ? 'done' : ''}`}>
      <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} />
      <span>{todo.text}</span>
    </div>
  )
}

function TodoPage(_props: {}, ctx: WfuiContext) {
  const filters: Array<{ key: 'all' | 'active' | 'done'; label: string }> = [
    { key: 'all', label: '全部' }, { key: 'active', label: '进行中' }, { key: 'done', label: '已完成' },
  ]

  return (
    <div class="todo-app">
      <h1>Todo（{remaining}）</h1>
      <div class="input-row">
        <input value={input} onInput={(e: any) => input.value = e.target.value}
          onKeyDown={(e: any) => e.key === 'Enter' && addTodo()} placeholder="添加待办..." />
        <button onClick={addTodo}>添加</button>
      </div>
      <div class="filters">
        {filters.map(f => (
          <button class={computed(() => filter.value === f.key ? 'active' : '')}
            onClick={() => filter.value = f.key}>{f.label}</button>
        ))}
      </div>
      <div class="todo-list">
        <Show when={isEmpty} fallback={<For each={filteredTodos}>{(todo) => <TodoItem todo={todo} />}</For>}>
          <p class="empty">暂无待办</p>
        </Show>
      </div>
      <Show when={hasDone}><button class="clear" onClick={clearDone}>清除已完成</button></Show>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 首页
// ═══════════════════════════════════════════════════════════

function HomePage(_props: {}, ctx: WfuiContext) {
  return (
    <div class="home-page">
      <h1>wefu demo</h1>
      <p>欢迎！当前路径: {ctx.route.path}</p>
      <div class="nav-cards">
        <div class="card" onClick={() => ctx.app.navigate('/todo')}>
          <h3>Todo 应用</h3>
          <p>演示 signal + Show/For + 响应式列表</p>
        </div>
        <div class="card" onClick={() => ctx.app.navigate('/about')}>
          <h3>关于</h3>
          <p>演示路由和参数传递</p>
        </div>
        <div class="card" onClick={() => ctx.app.navigate('/user/wefu')}>
          <h3>用户</h3>
          <p>演示路由参数 /user/:name</p>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 关于页面
// ═══════════════════════════════════════════════════════════

function AboutPage(_props: {}, ctx: WfuiContext) {
  return (
    <div class="about-page">
      <h1>关于 wefu</h1>
      <ul>
        <li>核心: signal + TSX + (props, ctx)</li>
        <li>无 VDOM，无 hooks 规则</li>
        <li>与 weifuwu 后端共享 ctx 理念</li>
        <li>零上游依赖，核心 ~200 行</li>
      </ul>
      <p><strong>路由参数:</strong> {JSON.stringify(ctx.route.params)}</p>
      <p><strong>查询参数:</strong> {JSON.stringify(ctx.route.query)}</p>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
        <button onClick={() => ctx.app.navigate('/about?tab=intro')}>?tab=intro</button>
        <button onClick={() => ctx.app.navigate('/about?tab=api&version=1')}>?tab=api&version=1</button>
        <button onClick={() => ctx.app.navigate('/todo')}>去 Todo</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 404
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// 用户页面（演示路由参数）
// ═══════════════════════════════════════════════════════════

function UserPage(_props: {}, ctx: WfuiContext) {
  return (
    <div class="about-page">
      <h1>用户: {ctx.route.params.name}</h1>
      <p>路径: {ctx.route.path}</p>
      <p>所有参数: {JSON.stringify(ctx.route.params)}</p>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button onClick={() => ctx.app.navigate('/user/alice')}>alice</button>
        <button onClick={() => ctx.app.navigate('/user/bob')}>bob</button>
        <button onClick={() => ctx.app.navigate('/user/张三')}>张三</button>
      </div>
    </div>
  )
}

function NotFound(_props: {}, ctx: WfuiContext) {
  return (
    <div class="not-found">
      <h1>404</h1>
      <p>路径 {ctx.route.path} 未找到</p>
      <button onClick={() => ctx.app.navigate('/')}>回首页</button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 应用布局 + 路由挂载
// ═══════════════════════════════════════════════════════════

function AppShell(_props: {}, ctx: WfuiContext) {
  return (
    <div class="app-shell">
      <nav class="nav-bar">
        <span class="logo" onClick={() => ctx.app.navigate('/')}>wefu</span>
        <div class="nav-links">
          <a onClick={() => ctx.app.navigate('/')}>首页</a>
          <a onClick={() => ctx.app.navigate('/todo')}>Todo</a>
          <a onClick={() => ctx.app.navigate('/about')}>关于</a>
          <a onClick={() => ctx.app.navigate('/user/wefu')}>用户</a>
        </div>
      </nav>
      <main>
        <RouteView />  {/* ← 路由组件在此渲染 */}
      </main>
    </div>
  )
}

// ── 路由配置 ──

const routes: RouteDef[] = [
  { path: '/', component: HomePage, title: '首页' },
  { path: '/todo', component: TodoPage, title: 'Todo' },
  { path: '/about', component: AboutPage, title: '关于' },
  { path: '/user/:name', component: UserPage, title: '用户' },
]

// ── 启动 ──

const app = createApp()
app.use(api())
app.use(auth())
app.use(router({ routes, notFound: NotFound, mode: 'hash' }))
app.mount('#root', AppShell)
