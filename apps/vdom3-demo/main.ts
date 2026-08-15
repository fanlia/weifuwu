/**
 * vdom3 demo — 完整应用验证
 * 路由（/ /list /detail/:id）+ 计数器/列表/条件 + 事件流观测 + 回放
 */
import { h, createRouter, stream, replay, createRoot, recordToTest } from '../../src/ui-dom/vdom3/index.ts'
import { AiChat } from '../../src/components/AiChat/AiChat.ts'
import { useChat } from '../../src/ui-dom/hooks/chat.ts'

// ── AI 对话页面（agent 风格——流式回复） ──
// mock fetch（SSE 协议流——浏览器端到端验证流式渲染）
const origFetch = window.fetch.bind(window)
const sse = (ev: string, data: unknown) => `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`
window.fetch = (async (url: any, opts: any) => {
  if (String(url).includes('/api/chat')) {
    const replies = ['你好！', '我是 vdom3 助手。', '事件流渲染的流式回复。']
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        let i = 0
        const push = () => {
          if (i < replies.length) {
            controller.enqueue(new TextEncoder().encode(sse('wf:token', { text: replies[i] })))
            i++
            setTimeout(push, 200)
          } else {
            controller.enqueue(new TextEncoder().encode(sse('wf:done', {})))
            controller.close()
          }
        }
        setTimeout(push, 100)
      },
    })
    return new Response(streamBody, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
  }
  return origFetch(url, opts)
}) as any

// ── agent-platform Login 页面（真实 tsx 页面——vdom3 运行验证） ──
import { Login } from '../../apps/agent-platform/ui/pages/Login.tsx'

const V3LoginPage = async (_init: any, _ctx: any) => async () =>
  h('div', { id: 'v3-login' }, [
    h('h2', {}, 'vdom3 — agent-platform Login'),
    h(Login, {}),
  ])

// ── agent-platform Departments 页面（ctx.api 数据加载 + 列表 + 删除） ──
import { Departments } from '../../apps/agent-platform/ui/pages/Departments.tsx'

const V3DepartmentsPage = async (_init: any, _ctx: any) => async () => {
  const deptApi = {
    get: async (url: string) => {
      if (url === '/api/departments') {
        return { departments: [
          { id: 'd1', name: '产品组', is_dm: false, member_count: 5 },
          { id: 'd2', name: '设计组', is_dm: false, member_count: 3 },
          { id: 'dm-1', name: '小码', is_dm: true, member_count: 1 },
        ] }
      }
      return {}
    },
    delete: async () => ({ ok: true, status: 204 }),
    post: async () => ({}),
    put: async () => ({}),
  }
  return h('div', { id: 'v3-depts' }, [
    h('h2', {}, 'vdom3 — agent-platform Departments'),
    h(Departments, {}),
  ])
}

// ── agent-platform Chat 页面（消息列表 + 工具调用/审批/附件渲染） ──
import { Chat } from '../../apps/agent-platform/ui/pages/Chat.tsx'

// ── agent-platform AppLayout（完整应用入口——认证守卫 + 侧边栏导航） ──
import { AppLayout } from '../../apps/agent-platform/ui/components/AppLayout.tsx'
import { Departments } from '../../apps/agent-platform/ui/pages/Departments.tsx'

const V3AppPage = async (_init: any, _ctx: any) => async () => {
  return h('div', { id: 'v3-app' }, [
    h(AppLayout, {}, h('div', { class: 'wf-p-lg' }, [
      h('h3', {}, '当前页面内容（AppLayout children）'),
      h(Departments, {}),
    ])),
  ])
}

const V3ChatPage = async (_init: any, _ctx: any) => async () => {
  return h('div', { id: 'v3-chat' }, [
    h('h2', {}, 'vdom3 — agent-platform Chat'),
    h(Chat, {}),
  ])
}

const ChatPage = async (_init: any, ctx: any) => {
  const chat = ctx.ui.useChat({ url: '/api/chat' })
  return async () => h('div', { id: 'chat-page' }, [
    h('h2', {}, 'vdom3 demo — AI 对话'),
    h(AiChat, { chat, maxHeight: '50vh' }),
    h('button', { id: 'goto-home', onClick: () => router.navigate('/') }, '← home'),
  ])
}

function require_ns_record() { return { recordToTest } }

// 暴露事件流（浏览器观测）
;(window as any).__v3_events = () => stream.events()
;(window as any).__v3_replay = (targetId: string) => {
  const t = document.getElementById(targetId)
  if (t) { replay(stream.events(), t); return t.innerHTML.slice(0, 200) }
  return 'no-target'
}
// 导出：事件流 JSON（浏览器事故 → 本地转测试闭环）
;(window as any).__v3_export = () => JSON.stringify(stream.events())
// 导出：recordToTest 生成的测试代码（浏览器内预览——可直接粘贴为测试）
;(window as any).__v3_to_test = (name: string) => {
  const { recordToTest } = require_ns_record()
  return recordToTest(stream.events(), name)
}

// 共享状态（路由页面间）
let count = 0
const items = ['a', 'b', 'c']
let show = true

// ── TodoApp（真实感页面：异步加载 + 表单 + CRUD + 过滤） ──
let todoDb = [
  { id: 't1', text: '设计 vdom3', done: true },
  { id: 't2', text: '写测试', done: false },
  { id: 't3', text: '浏览器验证', done: false },
]
let todoN = 10
const fetchTodos = () => new Promise<any[]>((res) => setTimeout(() => res(todoDb.map((t) => ({ ...t }))), 30))

const TodoApp = async (_init: any, ctx: any) => {
  const todos = await fetchTodos()
  let input = ''
  let filter: 'all' | 'active' | 'done' = 'all'
  const rerender = () => ctx.render()
  return async () => {
    const visible = todos.filter((t) => (filter === 'all' ? true : filter === 'active' ? !t.done : t.done))
    return h('div', { id: 'todo-app' }, [
      h('h2', {}, `待办 (${todos.length})`),
      h('div', {}, [
        h('input', { id: 'new-todo', placeholder: '输入待办…', value: input, onInput: (e: any) => { input = e.target.value; rerender() } }),
        h('button', { id: 'add-btn', onClick: () => { if (input.trim()) { todos.push({ id: `t${++todoN}`, text: input.trim(), done: false }); input = ''; rerender() } } }, '添加'),
      ]),
      h('div', {}, [
        h('button', { id: 'f-active', onClick: () => { filter = 'active'; rerender() } }, '未完成'),
        h('button', { id: 'f-all', onClick: () => { filter = 'all'; rerender() } }, '全部'),
      ]),
      visible.length === 0
        ? h('div', { id: 'empty' }, '没有待办项')
        : h('ul', {}, visible.map((t) =>
            h('li', { key: t.id, class: t.done ? 'done' : '' }, [
              h('input', { type: 'checkbox', checked: t.done, onChange: () => { t.done = !t.done; rerender() } }),
              h('span', {}, t.text),
              h('button', { class: 'del', onClick: () => { todos.splice(todos.findIndex((x) => x.id === t.id), 1); rerender() } }, '×'),
            ]),
          )),
    ])
  }
}

// ── 页面组件 ──
const Home = async (_init: any, ctx: any) => {
  const rerender = () => ctx.render()
  return async () => h('div', { id: 'home' }, [
    h('h2', {}, 'vdom3 demo — home'),
    h('div', {}, [
      h('button', { id: 'inc', onClick: () => { count++; rerender() } }, [`count: ${count}`]),
      h('button', { id: 'add', onClick: () => { items.push(`item${items.length + 1}`); rerender() } }, 'add item'),
      h('button', { id: 'toggle', onClick: () => { show = !show; rerender() } }, 'toggle'),
      h('button', { id: 'goto-list', onClick: () => router.navigate('/list') }, '→ /list'),
    ]),
    show ? h('div', { id: 'cond' }, 'conditional shown') : null,
    h('ul', { id: 'list' }, items.map((it, i) => h('li', { key: it + i }, it))),
  ])
}

const List = async (_init: any, _ctx: any) => {
  return async () => h('div', { id: 'list-page' }, [
    h('h2', {}, 'vdom3 demo — list'),
    h('ul', {}, items.map((it, i) => h('li', { key: it + i }, it))),
    h('button', { id: 'goto-detail', onClick: () => router.navigate('/detail/42') }, '→ /detail/42'),
    h('button', { id: 'goto-home', onClick: () => router.navigate('/') }, '← home'),
  ])
}

const Detail = async (_init: any, _ctx: any) => {
  return async (props: any) => h('div', { id: 'detail-page' }, [
    h('h2', {}, `vdom3 demo — detail:${props.params?.id ?? '?'}`),
    h('button', { id: 'goto-list', onClick: () => router.navigate('/list') }, '← /list'),
    h('button', { id: 'goto-todos', onClick: () => router.navigate('/todos') }, '→ /todos'),
  ])
}

// ── 路由应用 ──
const root = document.getElementById('root')!
const router = createRouter([
  { path: '/', render: () => h(Home, {}) },
  { path: '/list', render: () => h(List, {}) },
  { path: '/detail/:id', render: (params) => h(Detail, { params }) },
  { path: '/todos', render: () => h(TodoApp, {}) },
  { path: '/chat', render: () => h(ChatPage, {}) },
  { path: '/v3-login', render: () => h(V3LoginPage, {}) },
  { path: '/v3-depts', render: () => h(V3DepartmentsPage, {}) },
  { path: '/v3-chat', render: () => h(V3ChatPage, {}) },
  { path: '/v3-app', render: () => h(V3AppPage, {}) },
], root, {
  ctx: {
    // 中间件面 mock（agent-platform 页面消费——ctx.api/confirm/toast）
    api: {
      get: async (url: string) => {
        if (url === '/api/departments') return { departments: [
          { id: 'd1', name: '产品组', is_dm: false, member_count: 5 },
          { id: 'd2', name: '设计组', is_dm: false, member_count: 3 },
        ] }
        if (url.includes('/messages')) return { messages: [
          { id: 'm1', role: 'user', content: '帮我分析一下数据', status: 'done', created_at: '2026-08-01T10:00:00Z' },
          { id: 'm2', role: 'assistant', sender_type: 'ai', content: '好的，我来分析。', status: 'done', tools: [
            { id: 'tc1', name: 'query_data', args: { sql: 'SELECT * FROM orders' }, result: '42 rows', status: 'ok' },
          ], created_at: '2026-08-01T10:00:01Z' },
          { id: 'm3', role: 'assistant', content: '分析完成：订单量环比 +12%', status: 'done', created_at: '2026-08-01T10:00:02Z' },
        ] }
        if (url.includes('/workspace')) return { department: { name: '产品组' }, members: [
          { id: 'u1', name: '小码', type: 'ai' }, { id: 'u2', name: '产品组', type: 'department' },
        ], env: { status: 'ready', label: '运行中' }, subDepartments: [] }
        if (url.includes('/agents')) return { agents: [{ id: 'ag1', user_id: 'u1', name: '小码' }] }
        if (url.includes('/artifacts')) return { artifacts: [] }
        return {}
      },
      delete: async () => ({ ok: true, status: 204 }),
      post: async () => ({}), put: async () => ({}),
    },
    confirm: async () => true,
    toast: (msg: string) => { console.log('[toast]', msg) },
    auth: {
      isLoggedIn: true,
      user: { id: 'u1', name: '测试用户', email: 'admin@demo.com' },
      role: 'owner',
      logout: () => { console.log('[auth] logout') },
    },
    route: { params: { id: 'd1' }, path: '/v3-app' },
    app: { navigate: (p: string) => { router.navigate(p) } },
  },
})
