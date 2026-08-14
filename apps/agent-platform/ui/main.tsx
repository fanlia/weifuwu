/// <reference path="../../../src/ui-dom/index.ts" />

/**
 * agent-platform 前端入口
 */

import { api, auth, ws } from 'weifuwu/ui-dom'
import { UIRouter, uiServe, h } from 'weifuwu/ui-dom'
import { EmptyState, confirm as uiDomConfirm, toast as uiDomToast } from 'weifuwu/components'

import { AppLayout } from './components/AppLayout'

// 主题启动应用（ThemeSwitch 仅 Settings 挂载——全局读 localStorage 防翻页/刷新丢失）
try {
  const stored = localStorage.getItem('wf_theme')
  if (stored === 'light' || stored === 'dark') document.documentElement.setAttribute('data-theme', stored)
  else document.documentElement.removeAttribute('data-theme')
} catch { /* 隐私模式 */ }
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { Agents } from './pages/Agents'
import { Templates } from './pages/Templates'
import { NewAgent } from './pages/NewAgent'
import { AgentDetail } from './pages/AgentDetail'
import { Departments } from './pages/Departments'
import { NewDepartment } from './pages/NewDepartment'
import { DepartmentDetail } from './pages/DepartmentDetail'
import { NewChat } from './pages/NewChat'
import { Approvals } from './pages/Approvals'
import { Chat } from './pages/Chat'
import { Settings } from './pages/Settings'

// ── 应用 ─────────────────────────────────────────────────

const app = new UIRouter()

// auth 实例引用（api 中间件的 onUnauthorized 运行时调 refresh——auth 后注入，
// 但请求发生晚于全部中间件注入——onAuth 回调已填充 ref）
const authRef: { current: null | { refresh: () => Promise<boolean> } } = { current: null }

// 中间件（api/auth/ws 为 client AppMiddleware——UIRouter.use 兼容注入 ctx）
app.use(api({
  baseURL: '',
  // 自动鉴权：请求自动带 Bearer token（apps 不再手写 Authorization 头）
  token: () => localStorage.getItem('agent_platform_token'),
  // 401（token 过期/无效）：先尝试 refresh（成功→重试请求）——刷新页 token 过期场景：
  // Dashboard 并发请求 401 不等 refresh 直接跳登录 = 一刷新就掉线（真实事故 2026-12）；
  // refresh 失败才清理凭证 + 跳登录（防「无效 token 空数据不跳转」）
  onUnauthorized: async () => {
    const ok = await authRef.current?.refresh?.()
    if (ok) return true // refresh 成功——重试原请求
    localStorage.removeItem('agent_platform_token')
    localStorage.removeItem('agent_platform_user')
    localStorage.removeItem('agent_platform_refresh')
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login'
    return false
  },
}))
app.use(auth({
  storage: localStorage,
  tokenKey: 'agent_platform_token',
  userKey: 'agent_platform_user',
  refreshTokenKey: 'agent_platform_refresh',
  onAuth: (authClient) => { authRef.current = authClient },
}))
app.use(ws({ url: '/ws' }))

// 命令式确认/轻提示（ui-dom 版——局部 registry）
app.use(uiDomConfirm())
app.use(uiDomToast())

// 认证页（无侧边栏）
app.get('/login', () => h(Login, {}), { title: '登录 — Agent Platform' })
app.get('/register', () => h(Register, {}), { title: '注册 — Agent Platform' })

// 工作台（AppLayout 包装——layout 中间件）
const layoutMw = async (_location: any, ctx: any, children: any) => {
  return async (loc: any, c: any) => {
    const child = await children(loc, c)
    // 子路由无匹配（null）→ 不包 AppLayout——回退父链（/login 等认证页不被 layout 拦截）
    if (child == null) return child
    return h(AppLayout, {}, child)
  }
}
const main = new UIRouter()
main.use(layoutMw)
main.get('', () => h(Dashboard, {}), { title: '概览 — Agent Platform' })
main.get('dashboard', () => h(Dashboard, {}), { title: '概览 — Agent Platform' })
main.get('agents', () => h(Agents, {}), { title: 'Agent — Agent Platform' })
main.get('templates', () => h(Templates, {}), { title: '模板市场 — Agent Platform' })
main.get('agents/new', () => h(NewAgent, {}), { title: '创建 Agent' })
main.get('agents/:id', () => h(AgentDetail, {}), { title: '编辑 Agent' })
main.get('departments', () => h(Departments, {}), { title: '部门 — Agent Platform' })
main.get('departments/new', () => h(NewDepartment, {}), { title: '创建部门' })
main.get('departments/:id', () => h(DepartmentDetail, {}), { title: '部门详情' })
main.get('chat/new', () => h(NewChat, {}), { title: '会话' })
  main.get('approvals', () => h(Approvals, {}), { title: '审批待办' })
main.get('chat/:id', () => h(Chat, {}), { title: '聊天' })
main.get('settings', () => h(Settings, {}), { title: '设置 — Agent Platform' })
app.use('/', main)

app.notFound(() => (
  h('div', { class: 'wf-p-xl', style: { paddingTop: '30vh' } },
    h(EmptyState, { icon: '🧭', text: '404 — 页面不存在' }),
  )
))

uiServe(app, { root: '#root' })
