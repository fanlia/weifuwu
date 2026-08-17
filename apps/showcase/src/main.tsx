/**
 * showcase 平台入口——六域路由（自举：createRouter + components + layout 原语）
 *
 * 路由（design/showcase-plan.md §5）：
 *   /                        首页（六域入口 + 计数）
 *   /components[/:category][/:id]   组件总览/分类/详情
 *   /layout[/:id]            布局原语
 *   /patterns[/:id]          页面模式
 *   /apps[/:id]              应用模板
 *   /backend[/:id]           后端能力
 *   /capabilities[/:id]      框架能力
 *   /guides[/:id]            指南
 *
 * 页面正文 = content/ 的 .md 渲染（Markdown 组件）——HTML 与 LLM 读的 .md 同源。
 */
import { createRouter, h, stream } from 'weifuwu/ui-dom'
import type { Component } from 'weifuwu/ui-dom'
import { v3Toast, v3Confirm, v3Notification } from 'weifuwu/ui-dom'
import { Home } from './pages/home.tsx'
import { ComponentsIndex, CategoryPage, ComponentPage } from './pages/components.tsx'
import { LayoutIndex, LayoutPage, PatternsIndex, PatternPage, AppsIndex, AppPage, BackendIndex, BackendPage, CapabilitiesIndex, CapabilityPage, GuidesIndex, GuidePage } from './pages/domains.tsx'
import { NotFound } from './pages/not-found.tsx'
import { Community } from './pages/community.tsx'
import { Shell } from './shell.tsx'

// ── 事件流观测（平台自带的调试工具——capabilities/events 自证） ──
;(window as any).__wf_tail = []
stream.subscribe((e: any) => {
  const arr = (window as any).__wf_tail
  arr.push({ k: `${e.entity}:${e.action}`, t: e.target, p: e.payload, ts: e.ts })
  if (arr.length > 2000) arr.splice(0, arr.length - 2000)
})

// ── 中间件装配（命令式 API——capabilities/middleware 自证） ──
let demoCtx: any = {}
demoCtx = v3Toast()(demoCtx)
demoCtx = v3Confirm()(demoCtx)
demoCtx = v3Notification()(demoCtx)

// ── 六域路由（layout 包裹 = 全站壳：导航/主题/搜索） ──
const router = createRouter(
  [
    { path: '/', render: () => h(Home, {}) },
    { path: '/components', render: () => h(ComponentsIndex, {}) },
    { path: '/components/:category', render: (p: Record<string, string>) => h(CategoryPage, p) },
    { path: '/components/:category/:id', render: (p: Record<string, string>) => h(ComponentPage, p) },
    { path: '/layout', render: () => h(LayoutIndex, {}) },
    { path: '/layout/:id', render: (p: Record<string, string>) => h(LayoutPage, p) },
    { path: '/patterns', render: () => h(PatternsIndex, {}) },
    { path: '/patterns/:id', render: (p: Record<string, string>) => h(PatternPage, p) },
    { path: '/apps', render: () => h(AppsIndex, {}) },
    { path: '/apps/:id', render: (p: Record<string, string>) => h(AppPage, p) },
    { path: '/backend', render: () => h(BackendIndex, {}) },
    { path: '/backend/:id', render: (p: Record<string, string>) => h(BackendPage, p) },
    { path: '/capabilities', render: () => h(CapabilitiesIndex, {}) },
    { path: '/capabilities/:id', render: (p: Record<string, string>) => h(CapabilityPage, p) },
    { path: '/guides', render: () => h(GuidesIndex, {}) },
    { path: '/guides/:id', render: (p: Record<string, string>) => h(GuidePage, p) },
    { path: '/community', render: () => h(Community, {}) },
    { path: '*', render: () => h(NotFound, {}) },
  ].map((r) => ({ ...r, layout: (page: any) => h(Shell, { page }) })),
  document.querySelector('#root') as HTMLElement,
  { ctx: demoCtx },
)
;(window as any).__wf_router = router
