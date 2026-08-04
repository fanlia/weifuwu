/**
 * 共享路由定义 — 前后端同一份声明
 *
 * 后端 uiSsr()：GET 匹配 → 自动 SSR + __DATA__ + 页面模板
 * 前端 router()：注入 ctx.route.params（两端同源）+ 客户端渲染/hydration
 */

import type { RouteDef } from 'weifuwu/client'
import { BlogPage } from './pages/BlogPage.tsx'

export const routes: RouteDef[] = [
  { path: '/blog/:slug', component: BlogPage, title: '博客' },
]
