/**
 * 场景客户端入口——uiServe 收养场景页面（空 root → 客户端渲染）
 *
 * pathname /scenario/:id → 场景注册表 vnode → ctx.stream(vnode) 渲染。
 * 场景组件工厂在客户端执行——交互状态真实流转（DOM 行为测试面）。
 * 每次交互 ctx.render() → 路由重跑 handler → stream 增量 diff（影子树对照）。
 */
import { uiServe, UIRouter, h } from '../../client/vdom/index.ts'
import { scenarios } from './registry.ts'

const router = new UIRouter()
for (const s of scenarios) {
  router.get(`/scenario/${s.id}`, (req, ctx) =>
    (ctx as { stream: (vnode: unknown) => Response }).stream(h(s.render, {})),
  )
}

uiServe(router, { root: '#root' })
