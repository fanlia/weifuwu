/**
 * 博客页客户端入口 — hydration 模式
 *
 * 服务端已渲染完整 HTML + window.__DATA__，这里收养现有 DOM（不重建、不闪跳）。
 * router() 注入 ctx.route.params（与后端 uiSsr 同源），BlogPage 工厂从 __DATA__ 同步读数据。
 */

import { createApp, router } from 'weifuwu/client'
import { routes } from './routes.tsx'

createApp()
  .use(router({ routes }))
  .mount('#root', routes[0].component, { hydrate: true })
