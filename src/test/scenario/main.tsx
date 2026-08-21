/**
 * 场景客户端入口——uiServe 收养场景页面（空 root → 客户端渲染）
 *
 * pathname /scenario/:id → 场景注册表 vnode → ctx.stream(vnode) 渲染。
 * 场景组件工厂在客户端执行——交互状态真实流转（DOM 行为测试面）。
 * 每次交互 ctx.render() → 路由重跑 handler → stream 增量 diff（影子树对照）。
 */
import { uiServe, UIRouter, h } from '../../client/vdom/index.ts'
import { i18n } from '../../client/vdom/middlewares/auth-i18n.ts'
import { ws } from '../../client/vdom/middlewares/ws.ts'
import { scenarios } from './registry.ts'

const router = new UIRouter()
for (const s of scenarios) {
  router.get(`/scenario/${s.id}`, (req, ctx) =>
    (ctx as { stream: (vnode: unknown) => Response }).stream(h(s.render, {})),
  )
}

// 中间件注入面（i18n——场景组件经 ctx.i18n 消费）
const i18nState = i18n({
  locale: 'zh',
  messages: {
    zh: { hello: '你好', count: '数量 {n}' },
    en: { hello: 'Hello', count: 'Count {n}' },
  },
})
const handle = uiServe(router, { root: '#root', i18n: i18nState, ws: ws() })
// unmount-dispose 场景：暴露 handle（场景按钮触发卸载）
;(window as unknown as { __scenarioHandle?: unknown }).__scenarioHandle = handle
