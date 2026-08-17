/**
 * multi 应用模板——应用编排（父应用嵌子应用：registerApp/hApp + 独立状态）
 *
 * 演示能力（design/vdom3-app-node.md）：
 *   - registerApp 注册子应用（工厂闭包持有实例状态——appId 复用不重跑）
 *   - hApp（<App appId />）在父树渲染子应用——app:mount/update 边界事件
 *   - 子应用独立状态：各自 let + render()，互不干扰
 * 纯前端编排——无后端（模板结构最简形态：app.tsx + server.ts + main.tsx）
 */
import { h, App, registerApp, createRouter, stream } from 'weifuwu/ui-dom'
import type { Component } from 'weifuwu/ui-dom'
import { Button, Input, Tag, PageHeader, Space } from 'weifuwu/components'

// ── 子应用 1：计数器（独立状态） ──
registerApp('multi-counter', (_props: any, _ctx: any) => {
  const Counter = async (_init: any, ctx: any) => {
    let count = 0
    let step = 1
    return async (_p: any) => (
      <div class="wf-stack wf-gap-sm">
        <Space align="center"><Tag variant="primary">子应用 1</Tag><b>{count}</b></Space>
        <div class="wf-row wf-gap-xs">
          <Button size="sm" onClick={() => { count -= step; ctx.ui.render() }}>-{step}</Button>
          <Button size="sm" variant="primary" onClick={() => { count += step; ctx.ui.render() }}>+{step}</Button>
          <Button size="sm" variant="ghost" onClick={() => { step = step === 1 ? 5 : 1; ctx.ui.render() }}>步长 {step}→{step === 1 ? 5 : 1}</Button>
        </div>
      </div>
    )
  }
  return h(Counter, {})
})

// ── 子应用 2：迷你任务（独立状态——与计数器互不干扰） ──
registerApp('multi-todo', (_props: any, _ctx: any) => {
  const MiniTodo = async (_init: any, ctx: any) => {
    let items: string[] = ['子应用任务 A', '子应用任务 B']
    let input = ''
    return async (_p: any) => (
      <div class="wf-stack wf-gap-sm">
        <Tag variant="success">子应用 2</Tag>
        <div class="wf-row wf-gap-xs">
          <input class="wf-input" style="flex:1" value={input}
            onInput={(e: any) => { input = (e.target as HTMLInputElement).value; ctx.ui.render() }}
            placeholder="新任务…" />
          <Button size="sm" onClick={() => { if (input.trim()) { items.push(input.trim()); input = ''; ctx.ui.render() } }}>添加</Button>
        </div>
        <ul style="margin:0;padding-left:16px">
          {items.map((it, i) => <li key={it + i} class="wf-text-sm">{it}</li>)}
        </ul>
      </div>
    )
  }
  return h(MiniTodo, {})
})

// ── 父应用：工作台（嵌入子应用 + 边界事件观测） ──
export const WorkbenchPage: Component = async (_init: any, ctx: any) => {
  // 边界事件观测（stream——app:mount/update 可观测）
  let appEvents: string[] = []
  const off = stream.subscribe((e: any) => {
    if (e.entity === 'app' && appEvents.length < 12) {
      appEvents.push(`${e.action}:${(e.payload as any)?.appId ?? ''}`)
      ctx.ui.render()
    }
  })
  ctx.ui.onUnmount?.(off)
  return async (_p: any) => (
    <div class="wf-stack wf-gap-md">
      <PageHeader title="应用编排工作台" sub="父应用嵌入子应用——registerApp 注册 · <App appId /> 渲染 · 独立状态" />
      <div class="wf-grid" style="--wf-cols:repeat(auto-fit,minmax(240px,1fr));--wf-gap:12px">
        <div class="wf-surface wf-border wf-rounded-md wf-p-md wf-stack wf-gap-sm">
          <b class="wf-text-sm">计数器（子应用 1）</b>
          {h(App, { appId: 'multi-counter' })}
        </div>
        <div class="wf-surface wf-border wf-rounded-md wf-p-md wf-stack wf-gap-sm">
          <b class="wf-text-sm">迷你任务（子应用 2）</b>
          {h(App, { appId: 'multi-todo' })}
        </div>
      </div>
      <div class="wf-surface wf-border wf-rounded-md wf-p-md wf-stack wf-gap-xs">
        <b class="wf-text-sm">边界事件（stream 实时观测）</b>
        {appEvents.length === 0 ? <span class="wf-text-xs wf-text-tertiary">（等待 app:* 事件——切换页面再回来可看到 app:unmount/mount）</span> : (
          appEvents.map((e, i) => <code key={i} class="wf-text-xs" style="font-family:var(--wf-font-mono)">app:{e}</code>)
        )}
      </div>
    </div>
  )
}

export const multiRoutes = [
  { path: '/', render: () => h(WorkbenchPage, {}) },
]

export const pathFromHash = (): string => location.hash.replace(/^#/, '') || '/'

export function createMultiApp(root: HTMLElement, options?: { history?: boolean }): ReturnType<typeof createRouter> {
  return createRouter(multiRoutes, root, options?.history === false
    ? { history: false, initialPath: pathFromHash() }
    : undefined)
}
