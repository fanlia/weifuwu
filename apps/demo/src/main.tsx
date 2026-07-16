/**
 * 演示 wefu 路由 + signal + (props, ctx) + Show/For
 */

import { signal, computed, Show, For, createApp, api, auth, ws, router, RouteView } from 'weifuwu/client'
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
// WebSocket 实时页面
// ═══════════════════════════════════════════════════════════

function RealtimePage(_props: {}, ctx: WfuiContext) {
  const messages = signal<Array<{ type: string; body: string; ts?: number }>>([])
  const input = signal('')

  // 监听 WS 消息
  ctx.ws.onMessage((data: any) => {
    messages.value = [...messages.value, data]
  })

  const send = () => {
    const text = input.value.trim()
    if (!text) return
    ctx.ws.send({ body: text })
    input.value = ''
  }

  return (
    <div class="todo-app">
      <h1>WebSocket 实时通信</h1>
      <p style="margin-bottom:12px">
        连接状态：
        <Show when={ctx.ws.isConnected} fallback={<span style="color:red">未连接</span>}>
          <span style="color:green">已连接</span>
        </Show>
      </p>
      <div class="todo-list" style="max-height:300px;overflow-y:auto;border:1px solid #eee;border-radius:6px;padding:8px;margin-bottom:12px">
        <For each={messages}>
          {(msg) => (
            <div style={{
              padding: '6px 8px',
              margin: '4px 0',
              borderRadius: '6px',
              background: msg.type === 'system' ? '#e8f4e8' : msg.type === 'echo' ? '#e8f0ff' : '#f5f5f5',
              fontSize: '14px',
            }}>
              <strong>{msg.type === 'system' ? '系统' : msg.type === 'echo' ? '回显' : '消息'}:</strong>{' '}
              {msg.body}
              {msg.ts ? <span style="color:#999;font-size:12px;margin-left:8px">{new Date(msg.ts).toLocaleTimeString()}</span> : null}
            </div>
          )}
        </For>
      </div>
      <div class="input-row">
        <input value={input} onInput={(e: any) => input.value = e.target.value}
          onKeyDown={(e: any) => e.key === 'Enter' && send()}
          placeholder="输入消息，回车发送..." />
        <button onClick={send}>发送</button>
      </div>
    </div>
  )
}

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
          <a onClick={() => ctx.app.navigate('/ws')}>实时</a>
          <a onClick={() => window.location.href = '/blog/hello-ssr'}>博客</a>
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
  { path: '/ws', component: RealtimePage, title: 'WebSocket' },
]

// ── SSR Like Button 组件 ──

function LikeButton(_props: {}, _ctx: WfuiContext): Node {
  const count = signal(0)
  return (
    <button onClick={() => count.value++} style={{
      padding: '8px 20px',
      border: '1px solid #ddd',
      borderRadius: '6px',
      background: '#fff',
      cursor: 'pointer',
      fontSize: '16px',
    }}>
      ❤️ {count}
    </button>
  )
}

// ── 启动 ──

const app = createApp()
app.use(api())
app.use(auth())
app.use(ws())
app.use(router({ routes, notFound: NotFound, mode: 'hash' }))

// 检测 SSR 页面：如果 #root 已有内容，只 hydrate 交互区域
const root = document.getElementById('root')
const hasSsr = root && root.children.length > 0

if (hasSsr) {
  // SSR 页面：不挂载 SPA，只 hydrate 标记的区域
  const likeTarget = document.querySelector('[data-hydrate="like"]')
  if (likeTarget) app.hydrate('[data-hydrate="like"]', LikeButton)
} else {
  app.mount('#root', AppShell)
}
