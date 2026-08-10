/// <reference path="../../../src/ui-dom/index.ts" />

/**
 * agent-platform 前端入口
 */

import { api, auth, ws } from 'weifuwu/ui-dom'
import { UIRouter, uiServe, h } from 'weifuwu/ui-dom'
import { EmptyState, confirm as uiDomConfirm, toast as uiDomToast } from 'weifuwu/components'

import { AppLayout } from './components/AppLayout'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { Agents } from './pages/Agents'
import { NewAgent } from './pages/NewAgent'
import { AgentDetail } from './pages/AgentDetail'
import { Departments } from './pages/Departments'
import { NewDepartment } from './pages/NewDepartment'
import { DepartmentDetail } from './pages/DepartmentDetail'
import { NewChat } from './pages/NewChat'
import { Chat } from './pages/Chat'
import { Companies } from './pages/Companies'
import { NewCompany } from './pages/NewCompany'
import { Settings } from './pages/Settings'

// ── 应用 ─────────────────────────────────────────────────

const app = new UIRouter()

// 中间件（api/auth/ws 为 client AppMiddleware——UIRouter.use 兼容注入 ctx）
app.use(api({
  baseURL: '',
  // 自动鉴权：请求自动带 Bearer token（apps 不再手写 Authorization 头）
  token: () => localStorage.getItem('agent_platform_token'),
}))
app.use(auth({
  storage: localStorage,
  tokenKey: 'agent_platform_token',
  userKey: 'agent_platform_user',
  refreshTokenKey: 'agent_platform_refresh',
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
main.get('agents', () => h(Agents, {}), { title: 'Agent — Agent Platform' })
main.get('agents/new', () => h(NewAgent, {}), { title: '创建 Agent' })
main.get('agents/:id', () => h(AgentDetail, {}), { title: '编辑 Agent' })
main.get('companies', () => h(Companies, {}), { title: '公司 — Agent Platform' })
main.get('companies/new', () => h(NewCompany, {}), { title: '创建公司' })
main.get('departments', () => h(Departments, {}), { title: '部门 — Agent Platform' })
main.get('departments/new', () => h(NewDepartment, {}), { title: '创建部门' })
main.get('departments/:id', () => h(DepartmentDetail, {}), { title: '部门详情' })
main.get('chat/new', () => h(NewChat, {}), { title: '发起聊天' })
main.get('chat/:id', () => h(Chat, {}), { title: '聊天' })
main.get('settings', () => h(Settings, {}), { title: '设置 — Agent Platform' })
app.use('/', main)

app.notFound(() => (
  h('div', { class: 'wf-p-xl', style: { paddingTop: '30vh' } },
    h(EmptyState, { icon: '🧭', text: '404 — 页面不存在' }),
  )
))

uiServe(app, { root: '#root' })
