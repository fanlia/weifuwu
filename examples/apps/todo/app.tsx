/**
 * todo 应用模板——完整全栈（复制即用，随 npm 包发布 examples/apps/todo/）
 *
 * 演示（design/showcase-plan.md §P2）：
 *   - 多页路由（/ 列表 + /new 新建）+ createStore 跨页状态
 *   - 后端：MemorySql 持久化（契约层——生产换 postgres() 一行）
 *   - 嵌入方式：createRouter(routes, root, { history: false })——showcase 页面内嵌
 */
import { UIRouter, uiServe, h, createStore, createClientBrowser } from 'weifuwu/vdom'
import type { Component } from 'weifuwu/vdom'
import { Button, Input, Checkbox, Tag, EmptyState, PageHeader, Form, Field, Alert } from 'weifuwu/components'

export interface Todo {
  id: string
  name: string
  done: boolean
}

export const todoStore = createStore<{ todos: Todo[]; loading: boolean; error: string | null }>({
  todos: [],
  loading: true,
  error: null,
})

export async function loadTodos(): Promise<void> {
  todoStore.update((s) => { s.loading = true; s.error = null })
  try {
    const res = await fetch('/api/todos')
    const data = await res.json()
    todoStore.update((s) => { s.todos = data.rows; s.loading = false })
  } catch (e) {
    todoStore.update((s) => { s.error = (e as Error).message; s.loading = false })
  }
}

/** 列表页 */
export const TodoList: Component = async (_init: any, ctx: any) => {
  void loadTodos()
  const state = ctx.ui.useExternal(todoStore)
  const toggle = async (t: Todo) => {
    await fetch(`/api/todos/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: !t.done }) })
    await loadTodos()
  }
  const del = async (t: Todo) => {
    await fetch(`/api/todos/${t.id}`, { method: 'DELETE' })
    await loadTodos()
  }
  return async (_p: any) => (
    <div class="wf-stack wf-gap-md">
      <PageHeader title="任务列表" sub={`${state.todos.filter((t: Todo) => !t.done).length} 个未完成`}>
        <Button variant="primary" onClick={() => location.hash = '#/new'}>新建任务</Button>
      </PageHeader>
      {state.error && <Alert variant="error">{state.error}</Alert>}
      {state.loading && <div class="wf-text-secondary">加载中…</div>}
      {!state.loading && state.todos.length === 0 && <EmptyState text="暂无任务——点击「新建任务」开始" />}
      <div class="wf-stack wf-gap-xs">
        {state.todos.map((t: Todo) => (
          <div key={t.id} class="wf-surface wf-border wf-rounded-sm wf-p-sm wf-row wf-between">
            <div class="wf-row wf-gap-sm">
              <Checkbox checked={t.done} onChange={() => void toggle(t)} />
              <span class={t.done ? 'wf-text-tertiary' : ''} style={t.done ? 'text-decoration:line-through' : ''}>{t.name}</span>
            </div>
            <div class="wf-row wf-gap-xs">
              {t.done && <Tag variant="success">完成</Tag>}
              <Button size="sm" variant="ghost" onClick={() => void del(t)}>删除</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 新建页 */
export const TodoNew: Component = async (_init: any, ctx: any) => {
  let name = ''
  let error = ''
  let saving = false
  const submit = async () => {
    if (!name.trim()) { error = '任务名不能为空'; ctx.render(); return }
    saving = true; error = ''; ctx.render()
    try {
      await fetch('/api/todos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      await loadTodos()
      location.hash = '#/'
    } catch (e) {
      error = (e as Error).message; saving = false; ctx.render()
    }
  }
  return async (_p: any) => (
    <div class="wf-stack wf-gap-md" style="max-width:480px">
      <PageHeader title="新建任务" sub="填写任务名称——提交后写入 MemorySql" />
      <Form onSubmit={() => void submit()}>
        <Field label="任务名称" error={error}>
          <Input value={name} onInput={(e: any) => { name = (e.target as HTMLInputElement).value; ctx.render() }}
            placeholder="例如：完成 showcase Phase 2" autoFocus />
        </Field>
        <div class="wf-row wf-gap-sm">
          <Button variant="primary" loading={saving} onClick={() => void submit()}>保存</Button>
          <Button variant="ghost" onClick={() => location.hash = '#/'}>取消</Button>
        </div>
      </Form>
    </div>
  )
}

// ── 路由表（layout 包裹 + 参数——模板可复制部分） ──
export const todoRoutes = [
  { path: '/', render: () => h(TodoList, {}) },
  { path: '/new', render: () => h(TodoNew, {}) },
]

/** hash → 内部路径（模板导航约定：location.hash = '#/new'——独立运行可深链/嵌入不污染宿主 pathname） */
export const pathFromHash = (): string => location.hash.replace(/^#/, '') || '/'

/** 应用入口：createTodoApp(root)——独立运行（main.tsx）与嵌入（showcase）复用 */
export function createTodoApp(root: HTMLElement, _options?: { history?: boolean }): ReturnType<typeof uiServe> {
  // vdom 规范面：UIRouter + uiServe——布局共享精准路由
  const router = new UIRouter()
  for (const r of todoRoutes) {
    router.get(r.path, (req: Request, ctx: any) =>
      (ctx as { stream: (v: unknown) => Response }).stream(r.render()))
  }
  return uiServe(router, { root, browser: createClientBrowser()! })
}
