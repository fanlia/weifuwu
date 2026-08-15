/**
 * agent-platform vdom3 入口（v3-main）——默认引擎切换验证
 *
 * 与 main.tsx 同构：中间件链（vdom2 中间件复用——纯函数注入）+
 * createRouter（vdom3 路由——RouteDef.layout 布局复用）+ 页面路由。
 */
import { api, auth, ws, i18n } from 'weifuwu/ui-dom'
import { createRouter, h } from '../../../src/ui-dom/vdom3/index.ts'

import { AppLayout } from './components/AppLayout'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Workspace } from './pages/Workspace'
import { Reports } from './pages/Reports'
import { Agents } from './pages/Agents'
import { Templates } from './pages/Templates'
import { Departments } from './pages/Departments'
import { Chat } from './pages/Chat'
import { Settings } from './pages/Settings'
import { NewAgent } from './pages/NewAgent'
import { AgentDetail } from './pages/AgentDetail'
import { Sandboxes } from './pages/Sandboxes'
import { NewDepartment } from './pages/NewDepartment'
import { DepartmentDetail } from './pages/DepartmentDetail'
import { NewChat } from './pages/NewChat'
import { Approvals } from './pages/Approvals'
import { Admin } from './pages/Admin'

// ── 中间件链（复用 vdom2 中间件——(ctx) => ctx' 纯函数） ──
const authRef: { current: null | { refresh: () => Promise<boolean> } } = { current: null }
let ctx: any = {}
ctx = await api({
  baseURL: '',
  // 自动鉴权：请求自动带 Bearer token
  token: () => localStorage.getItem('agent_platform_token'),
  // 401：先 refresh（成功重试）——失败清理 + 跳登录
  onUnauthorized: async () => {
    const ok = await authRef.current?.refresh?.()
    if (ok) return true
    localStorage.removeItem('agent_platform_token')
    localStorage.removeItem('agent_platform_user')
    localStorage.removeItem('agent_platform_refresh')
    if (!window.location.pathname.startsWith('/login')) window.location.href = '/login'
    return false
  },
})(ctx)
ctx = auth({
  onAuth: (auth: any) => { authRef.current = { refresh: () => auth.refresh() } },
  storage: localStorage,
  tokenKey: 'agent_platform_token',
  userKey: 'agent_platform_user',
  refreshTokenKey: 'agent_platform_refresh',
})(ctx)
ctx = i18n({ locale: 'zh-CN' })(ctx)
ctx = ws({ url: '/ws' })(ctx)
// 命令式 confirm/toast：vdom3 适配（portal 挂载）暂缺——页面可选链消费（?./!! 调用处按需 mock）
ctx = Object.assign(ctx, {
  confirm: async () => true,
  toast: (_msg: string, _variant?: string) => {},
})

// ── 路由（AppLayout 布局——跨路由复用） ──
const layout = (page: any) => h(AppLayout, {}, page)
const root = document.getElementById('root')!
// ctx.app（登录后跳转——router 引用后绑定）
let router: ReturnType<typeof createRouter>
ctx.app = { navigate: (p: string) => router.navigate(p) }
router = createRouter([
  { path: '/login', render: () => h(Login, {}) },
  { path: '/register', render: () => h(Register, {}) },
  { path: '/', render: () => h(Workspace, {}), layout },
  { path: '/dashboard', render: () => h(Workspace, {}), layout },
  { path: '/reports', render: () => h(Reports, {}), layout },
  { path: '/agents', render: () => h(Agents, {}), layout },
  { path: '/templates', render: () => h(Templates, {}), layout },
  { path: '/departments', render: () => h(Departments, {}), layout },
  { path: '/chat/:id', render: () => h(Chat, {}), layout },
  { path: '/chat/new', render: () => h(NewChat, {}), layout },
  { path: '/settings', render: () => h(Settings, {}), layout },
  { path: '/agents/new', render: () => h(NewAgent, {}), layout },
  { path: '/agents/:id', render: () => h(AgentDetail, {}), layout },
  { path: '/sandboxes', render: () => h(Sandboxes, {}), layout },
  { path: '/departments/new', render: () => h(NewDepartment, {}), layout },
  { path: '/departments/:id', render: () => h(DepartmentDetail, {}), layout },
  { path: '/approvals', render: () => h(Approvals, {}), layout },
  { path: '/admin', render: () => h(Admin, {}), layout },
], root, { ctx })
