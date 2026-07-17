/**
 * 演示 wefu 路由 + signal + (props, ctx) + Show/For
 */

import { signal, computed, Show, For, createApp, api, auth, ws, router, RouteView, Transition, createStyles } from 'weifuwu/client'
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
    <div class={`flex items-center gap-2 py-2 border-b border-gray-50 ${todo.done ? 'opacity-50' : ''}`}>
      <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} class="cursor-pointer" />
      <span class={todo.done ? 'line-through text-gray-400' : ''}>{todo.text}</span>
    </div>
  )
}

function TodoPage(_props: {}, ctx: WfuiContext) {
  const filters: Array<{ key: 'all' | 'active' | 'done'; label: string }> = [
    { key: 'all', label: '全部' }, { key: 'active', label: '进行中' }, { key: 'done', label: '已完成' },
  ]

  return (
    <div class="bg-white rounded-xl p-6 shadow-md">
      <h1 class="text-xl font-bold mb-4">Todo（{remaining}）</h1>
      <div class="flex gap-2 mb-4">
        <input class="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
          value={input} onInput={(e: any) => input.value = e.target.value}
          onKeyDown={(e: any) => e.key === 'Enter' && addTodo()} placeholder="添加待办..." />
        <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600" onClick={addTodo}>添加</button>
      </div>
      <div class="flex gap-2 mb-4">
        {filters.map(f => (
          <button class={computed(() => {
            const base = 'px-3 py-1 border rounded-full text-sm cursor-pointer'
            return filter.value === f.key
              ? base + ' bg-blue-500 text-white border-blue-500'
              : base + ' bg-white text-gray-600 border-gray-300'
          })}
            onClick={() => filter.value = f.key}>{f.label}</button>
        ))}
      </div>
      <div class="mb-4">
        <Show when={isEmpty} fallback={<For each={filteredTodos}>{(todo) => <TodoItem todo={todo} />}</For>}>
          <p class="text-gray-400 text-center py-5 text-sm">暂无待办</p>
        </Show>
      </div>
      <Show when={hasDone}><button class="px-4 py-1.5 bg-red-500 text-white rounded-md text-sm cursor-pointer" onClick={clearDone}>清除已完成</button></Show>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 首页
// ═══════════════════════════════════════════════════════════

function HomePage(_props: {}, ctx: WfuiContext) {
  return (
    <div>
      <h1 class="text-2xl font-bold mb-2">wefu demo</h1>
      <p class="text-gray-500 mb-5">欢迎！当前路径: {ctx.route.path}</p>
      <div class="flex gap-3">
        <div class="flex-1 bg-white rounded-lg p-4 cursor-pointer shadow-sm hover:shadow-md" onClick={() => ctx.app.navigate('/todo')}>
          <h3 class="text-base font-semibold mb-1">Todo 应用</h3>
          <p class="text-sm text-gray-400">演示 signal + Show/For + 响应式列表</p>
        </div>
        <div class="flex-1 bg-white rounded-lg p-4 cursor-pointer shadow-sm hover:shadow-md" onClick={() => ctx.app.navigate('/about')}>
          <h3 class="text-base font-semibold mb-1">关于</h3>
          <p class="text-sm text-gray-400">演示路由和参数传递</p>
        </div>
        <div class="flex-1 bg-white rounded-lg p-4 cursor-pointer shadow-sm hover:shadow-md" onClick={() => ctx.app.navigate('/user/wefu')}>
          <h3 class="text-base font-semibold mb-1">用户</h3>
          <p class="text-sm text-gray-400">演示路由参数 /user/:name</p>
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
    <div class="bg-white rounded-xl p-6 shadow-md">
      <h1 class="text-xl font-bold mb-3">关于 wefu</h1>
      <ul class="pl-5 mb-3 text-gray-600">
        <li class="mb-1">核心: signal + TSX + (props, ctx)</li>
        <li class="mb-1">无 VDOM，无 hooks 规则</li>
        <li class="mb-1">与 weifuwu 后端共享 ctx 理念</li>
        <li class="mb-1">零上游依赖，核心 ~200 行</li>
      </ul>
      <p><strong>路由参数:</strong> {JSON.stringify(ctx.route.params)}</p>
      <p><strong>查询参数:</strong> {JSON.stringify(ctx.route.query)}</p>
      <div class="mt-3 flex gap-2 flex-wrap">
        <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600" onClick={() => ctx.app.navigate('/about?tab=intro')}>?tab=intro</button>
        <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600" onClick={() => ctx.app.navigate('/about?tab=api&version=1')}>?tab=api&version=1</button>
        <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600" onClick={() => ctx.app.navigate('/todo')}>去 Todo</button>
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
    <div class="bg-white rounded-xl p-6 shadow-md">
      <h1 class="text-xl font-bold mb-3">WebSocket 实时通信</h1>
      <p class="mb-3">
        连接状态：
        <Show when={ctx.ws.isConnected} fallback={<span class="text-red-500">未连接</span>}>
          <span class="text-green-600">已连接</span>
        </Show>
      </p>
      <div class="max-h-72 overflow-y-auto border border-gray-200 rounded-md p-2 mb-3">
        <For each={messages}>
          {(msg) => (
            <div class={`p-1.5 my-1 rounded-md text-sm ${
              msg.type === 'system' ? 'bg-green-50' : msg.type === 'echo' ? 'bg-blue-50' : 'bg-gray-50'
            }`}>
              <strong>{msg.type === 'system' ? '系统' : msg.type === 'echo' ? '回显' : '消息'}:</strong>{' '}
              {msg.body}
              {msg.ts ? <span class="text-gray-400 text-xs ml-2">{new Date(msg.ts).toLocaleTimeString()}</span> : null}
            </div>
          )}
        </For>
      </div>
      <div class="flex gap-2">
        <input class="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
          value={input} onInput={(e: any) => input.value = e.target.value}
          onKeyDown={(e: any) => e.key === 'Enter' && send()}
          placeholder="输入消息，回车发送..." />
        <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600" onClick={send}>发送</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 用户页面（演示路由参数）
// ═══════════════════════════════════════════════════════════

function UserPage(_props: {}, ctx: WfuiContext) {
  return (
    <div class="bg-white rounded-xl p-6 shadow-md">
      <h1 class="text-xl font-bold mb-3">用户: {ctx.route.params.name}</h1>
      <p class="mb-1">路径: {ctx.route.path}</p>
      <p class="mb-3">所有参数: {JSON.stringify(ctx.route.params)}</p>
      <div class="flex gap-2">
        <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600" onClick={() => ctx.app.navigate('/user/alice')}>alice</button>
        <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600" onClick={() => ctx.app.navigate('/user/bob')}>bob</button>
        <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600" onClick={() => ctx.app.navigate('/user/张三')}>张三</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 动画演示页面
// ═══════════════════════════════════════════════════════════

function TransitionDemo(_props: {}, _ctx: WfuiContext) {
  const show = signal(false)
  const anim = signal<'fade' | 'slide-up' | 'scale'>('fade')

  const s = createStyles({
    btn: 'px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600 mr-2',
    btnActive: 'px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer ring-2 ring-blue-300 mr-2',
    box: 'mt-4 p-6 bg-white rounded-xl shadow-md text-center text-lg',
  })

  const animations = ['fade', 'slide-up', 'scale'] as const

  return (
    <div>
      <h1 class="text-xl font-bold mb-4">Transition 动画演示</h1>

      <div class="mb-3">
        {animations.map(a => (
          <button class={anim.value === a ? s.btnActive : s.btn}
            onClick={() => anim.value = a}>{a}</button>
        ))}
      </div>

      <button class="px-4 py-2 bg-green-500 text-white rounded-md text-sm cursor-pointer hover:bg-green-600"
        onClick={() => show.value = !show.value}>
        {show.value ? '隐藏' : '显示'}
      </button>

      <Transition show={show} name={anim.value}>
        <div class={s.box}>
          🎉 动画内容
        </div>
      </Transition>
    </div>
  )
}

function NotFound(_props: {}, ctx: WfuiContext) {
  return (
    <div class="text-center py-16">
      <h1 class="text-5xl text-gray-300">404</h1>
      <p class="my-3 text-gray-400">路径 {ctx.route.path} 未找到</p>
      <button class="px-4 py-2 bg-blue-500 text-white rounded-md text-sm cursor-pointer hover:bg-blue-600" onClick={() => ctx.app.navigate('/')}>回首页</button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// 应用布局 + 路由挂载
// ═══════════════════════════════════════════════════════════

function AppShell(_props: {}, ctx: WfuiContext) {
  return (
    <div>
      <nav class="flex items-center gap-6 py-3 border-b border-gray-200 mb-5">
        <span class="font-bold text-lg cursor-pointer text-blue-500" onClick={() => ctx.app.navigate('/')}>wefu</span>
        <div class="flex gap-4">
          <a class="cursor-pointer text-gray-500 text-sm hover:text-blue-500" onClick={() => ctx.app.navigate('/')}>首页</a>
          <a class="cursor-pointer text-gray-500 text-sm hover:text-blue-500" onClick={() => ctx.app.navigate('/todo')}>Todo</a>
          <a class="cursor-pointer text-gray-500 text-sm hover:text-blue-500" onClick={() => ctx.app.navigate('/about')}>关于</a>
          <a class="cursor-pointer text-gray-500 text-sm hover:text-blue-500" onClick={() => ctx.app.navigate('/user/wefu')}>用户</a>
          <a class="cursor-pointer text-gray-500 text-sm hover:text-blue-500" onClick={() => ctx.app.navigate('/ws')}>实时</a>
          <a class="cursor-pointer text-gray-500 text-sm hover:text-blue-500" onClick={() => ctx.app.navigate('/transition')}>动画</a>
          <a class="cursor-pointer text-gray-500 text-sm hover:text-blue-500" onClick={() => window.location.href = '/blog/hello-ssr'}>博客</a>
        </div>
      </nav>
      <main>
        <RouteView />
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
  { path: '/transition', component: TransitionDemo, title: '动画' },
]

// ── SSR Like Button 组件 ──

function LikeButton(_props: {}, _ctx: WfuiContext): Node {
  const count = signal(0)
  return (
    <button onClick={() => count.value++} class="px-5 py-2 border border-gray-300 rounded-md bg-white cursor-pointer text-base hover:bg-gray-50">
      ❤️ {count}
    </button>
  )
}

// ── 启动 ──

const app = createApp()
app.use(api())
app.use(auth())
app.use(ws())
app.use(router({ routes, notFound: NotFound, mode: 'hash', transition: 'page' }))

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
