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
import { UIRouter, uiServe, h } from 'weifuwu/vdom'
import type { Component, RenderCtx, UIContext } from 'weifuwu/vdom'
import { toast } from '../../../src/client/vdom/commands.ts'
import { Home } from './pages/home.tsx'
import { ComponentsIndex, CategoryPage, ComponentPage } from './pages/components.tsx'
import { LayoutIndex, LayoutPage, PatternsIndex, PatternPage, AppsIndex, AppPage, BackendIndex, BackendPage, CapabilitiesIndex, CapabilityPage, GuidesIndex, GuidePage } from './pages/domains.tsx'
import { NotFound } from './pages/not-found.tsx'
import { Community } from './pages/community.tsx'
import { Shell } from './shell.tsx'

// ── 命令式 API（vdom commands——ctx.toast 注入） ──
const demoCtx: any = {}
demoCtx.toast = toast

// ── 六域路由（layout 包裹 = 全站壳：导航/主题/搜索） ──
// 页面 handler（Shell 布局包裹——root 稳定——布局共享精准路由）
const page = (Comp: Component, props: Record<string, unknown> = {}) =>
  (req: Request, ctx: UIContext) =>
    (ctx as RenderCtx).stream(h(Shell, { page: h(Comp, props as never) }))

const router = new UIRouter()
router.get('/', page(Home))
router.get('/components', page(ComponentsIndex))
router.get('/components/:category', (req, ctx) => (ctx as RenderCtx).stream(h(Shell, { page: h(CategoryPage, { ...(ctx.params ?? {}) }) })))
router.get('/components/:category/:id', (req, ctx) => (ctx as RenderCtx).stream(h(Shell, { page: h(ComponentPage, { ...(ctx.params ?? {}) }) })))
router.get('/layout', page(LayoutIndex))
router.get('/layout/:id', (req, ctx) => (ctx as RenderCtx).stream(h(Shell, { page: h(LayoutPage, { ...(ctx.params ?? {}) }) })))
router.get('/patterns', page(PatternsIndex))
router.get('/patterns/:id', (req, ctx) => (ctx as RenderCtx).stream(h(Shell, { page: h(PatternPage, { ...(ctx.params ?? {}) }) })))
router.get('/apps', page(AppsIndex))
router.get('/apps/:id', (req, ctx) => (ctx as RenderCtx).stream(h(Shell, { page: h(AppPage, { ...(ctx.params ?? {}) }) })))
router.get('/backend', page(BackendIndex))
router.get('/backend/:id', (req, ctx) => (ctx as RenderCtx).stream(h(Shell, { page: h(BackendPage, { ...(ctx.params ?? {}) }) })))
router.get('/capabilities', page(CapabilitiesIndex))
router.get('/capabilities/:id', (req, ctx) => (ctx as RenderCtx).stream(h(Shell, { page: h(CapabilityPage, { ...(ctx.params ?? {}) }) })))
router.get('/guides', page(GuidesIndex))
router.get('/guides/:id', (req, ctx) => (ctx as RenderCtx).stream(h(Shell, { page: h(GuidePage, { ...(ctx.params ?? {}) }) })))
router.get('/community', page(Community))
router.notFound(() => new Response(null, { status: 404 }))

// ── 渲染落地（uiServe——UIRouter 唯一应用入口） ──
const serve = uiServe(router, {
  root: '#root',
  toast,
})
;(window as any).__wf_router = router
