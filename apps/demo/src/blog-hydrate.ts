/**
 * 博客页客户端入口 — hydration 模式
 *
 * 服务端已渲染完整 HTML + window.__DATA__，这里收养现有 DOM（不重建、不闪跳），
 * 只接线事件/ref/$；BlogPage 工厂从 __DATA__ 同步读数据，不重复请求。
 *
 * SSR 路由页没有客户端 router 中间件——用轻量中间件从 URL 解析 params 注入 ctx。
 */

import { createApp } from 'weifuwu/client'
import { BlogPage } from './blog-page.ts'

createApp()
  .use((ctx: any) => {
    // SSR 页的 params 注入（真实应用用 router() 中间件，这里从 URL 解析）
    const m = location.pathname.match(/^\/blog\/([^/]+)/)
    ctx.params = m ? { slug: decodeURIComponent(m[1]) } : {}
    return ctx
  })
  .mount('#root', BlogPage, { hydrate: true })
