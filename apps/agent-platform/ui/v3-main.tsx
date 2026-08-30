/**
 * agent-platform UI 入口（2027-03 迁移——当前 API：UIRouter + uiServe）
 *
 * 形态与 showcase 同构：UIRouter（路径 → 页面 handler）+ uiServe 渲染落地；
 * 中间件（api/auth/i18n/ws）+ 命令式（toast/confirm/notification）经
 * uiServe options 注入 ctx——页面 ctx.api/ctx.auth/ctx.toast 等消费面不变。
 */
import { UIRouter, uiServe, h, api, auth, i18n, ws, toast, injectCommands } from 'weifuwu/vdom'
import { refreshSession } from './lib/api'
import { confirm, notification } from 'weifuwu/components'

import { router } from './router'

// ── 中间件装配（当前 API——工厂返回 client——uiServe options 注入 ctx） ──
// **authClient 先定义（2027-09——刷新后 401 踢登录根因）**：onUnauthorized
// 直接调 authClient.refresh()——原实现经 onAuth 接线 authRef（仅 login/
// refresh 成功时赋值）——**页面刷新后模块变量重置——authRef=null——401 时
// refresh 未调用——直接清 token 跳登录**（access 过期（15min）后任何刷新
// 必踢——复现：过期 token+有效 refresh → /login）——闭包直接引用——消除
// 接线时机依赖
const authClient = auth({
  // refresh 链接线（真实事故——401 踢回登录循环）：onRefresh 复用
  // lib/api.ts 的刷新逻辑（/api/auth/refresh + localStorage 更新）——
  // 未接线时 auth.refresh() 永远 false——任何 401 直接清 token 跳登录
  onRefresh: () => refreshSession(),
  // StorageAdapter 形状（get/set——localStorage 是 getItem/setItem——适配）
  storage: {
    get: (k: string) => localStorage.getItem(k),
    set: (k: string, v: string) => { localStorage.setItem(k, v) },
  },
  tokenKey: 'agent_platform_token',
  userKey: 'agent_platform_user',
  refreshTokenKey: 'agent_platform_refresh',
})
const apiClient = api({
  baseUrl: '',
  // 自动鉴权：请求自动带 Bearer token
  token: () => localStorage.getItem('agent_platform_token'),
  // 401：先 refresh（成功重试）——失败清理 + 跳登录
  onUnauthorized: async () => {
    const ok = await authClient.refresh()
    if (ok) return true
    console.error('[auth] 401 刷新失败——踢回登录（路径:', location.pathname + ')')
    localStorage.removeItem('agent_platform_token')
    localStorage.removeItem('agent_platform_user')
    localStorage.removeItem('agent_platform_refresh')
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login'
    return false
  },
})
const i18nState = i18n({ locale: 'zh-CN' })
// 断线自动重连（2026-08——A2：指数退避——close 手动不重连）——
// 重连成功 → Chat onStatusChange 补拉断线期间消息（不丢上下文）
// **connect 调用（2026-08——流式缺失根因）**：uiServe 只注入 WsClient
// 面不自动连接——此前从未 connect——WS 零连接——AI 回复 token/done
// 事件永远收不到（消息上屏靠 HTTP 响应；回复只刷新后从 DB 可见）
const wsClient = ws({
  url: '/ws',
  autoReconnect: { baseMs: 1000, maxMs: 30000 },
  // 心跳看门狗（2026-08——网络硬断静默挂起根因歼灭——A2 补拉前提）：
  // 浏览器对网络断不触发 close/error——socket 挂起——重连永不启动——
  // 断线期间消息永远丢失。ping 周期活性检测——超时强制 close → 重连链
  // → onStatusChange(true) → Chat 补拉（消息不丢）——测试可经
  // window.__WF_WS_PING 覆写（快看门狗——生产默认保守）
  ping: ((globalThis as any).__WF_WS_PING as any) ?? { intervalMs: 15000, timeoutMs: 35000, payload: () => ({ type: 'ping' }) },
})
wsClient.connect('/ws')

// ── 路由（AppLayout 布局包裹——vnode 形态——跨路由同位置同类型复用——
//   AppLayout 的 let 状态跨导航保持；handler 返回 stream Response） ──
// ── 渲染落地（uiServe——UIRouter 唯一应用入口——中间件注入 ctx） ──
uiServe(router, {
  root: '#root',
  api: apiClient,
  auth: authClient,
  ws: wsClient,
  i18n: i18nState,
  toast,
  confirm,
  notification,
})
