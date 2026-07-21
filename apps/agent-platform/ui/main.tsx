/// <reference types="../../src/client/index.ts" />

/**
 * agent-platform 前端入口
 */

import { createApp, router, RouteView, api, auth, ws } from 'weifuwu/client'
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

// ── 应用 ─────────────────────────────────────────────────

const app = createApp()

// 中间件
app.use(api({ baseURL: '' }))
app.use(auth({
  storage: localStorage,
  tokenKey: 'agent_platform_token',
  userKey: 'agent_platform_user',
}))
app.use(ws({ url: '/ws' }))

app.use(router({
  mode: 'history',
  routes: [
    // 认证页（无侧边栏）
    { path: '/login', component: Login, title: '登录 — Agent Platform' },
    { path: '/register', component: Register, title: '注册 — Agent Platform' },

    // 工作台（持久化侧边栏布局）
    {
      path: '/',
      layout: AppLayout,
      children: [
        { path: '', component: Dashboard, title: '概览 — Agent Platform' },
        { path: 'agents', component: Agents, title: 'Agent — Agent Platform' },
        { path: 'agents/new', component: NewAgent, title: '创建 Agent' },
        { path: 'agents/:id', component: AgentDetail, title: '编辑 Agent' },
        { path: 'departments', component: Departments, title: '部门 — Agent Platform' },
        { path: 'departments/new', component: NewDepartment, title: '创建部门' },
        { path: 'departments/:id', component: DepartmentDetail, title: '部门详情' },
        { path: 'chat/new', component: NewChat, title: '发起聊天' },
        { path: 'chat/:id', component: Chat, title: '聊天' },
      ],
    },
  ],
  notFound: () => (
    <div class="empty" style={{ paddingTop: '30vh' }}>
      <div class="empty-ico">🧭</div>
      <div class="empty-txt">404 — 页面不存在</div>
    </div>
  ),
}))

// ── 挂载 ─────────────────────────────────────────────────

app.mount('#root', () => <RouteView />)
