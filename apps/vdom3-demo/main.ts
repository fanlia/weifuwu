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
], root)
