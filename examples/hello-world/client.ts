/**
 * client.ts——客户端入口（纯 SPA 渲染：vdom3 事件流引擎）
 * createRouter(routes, root) —— 监听 location → 匹配 → 事件流渲染
 */
import { UIRouter, uiServe } from 'weifuwu/vdom'
import { routes } from './routes.tsx'

// 路由声明 → UIRouter（get 挂载）→ uiServe 渲染（vdom 规范面）
const router = new UIRouter()
for (const r of routes) {
  router.get(r.path, (req: Request, ctx: any) =>
    (ctx as { stream: (v: unknown) => Response }).stream(r.render()))
}
uiServe(router, { root: document.querySelector('#root') as HTMLElement })
