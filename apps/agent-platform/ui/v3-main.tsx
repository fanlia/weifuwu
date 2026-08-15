/**
 * agent-platform vdom3 入口（v3-main）——默认引擎切换验证
 *
 * 与 main.tsx 同构：中间件链（vdom2 中间件复用——纯函数注入）+
 * createRouter（vdom3 路由——RouteDef.layout 布局复用）+ 页面路由。
 */
import { api, auth, ws, i18n } from 'weifuwu/ui-dom'
import { v3Confirm, v3Toast } from '../../../src/ui-dom/vdom3/commands.ts'
import { createRouter, h, compat } from '../../../src/ui-dom/vdom3/index.ts'

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
// 命令式 confirm/toast（vdom3 适配——createRoot 挂载 Confirm/Toast 组件）
ctx = v3Confirm()(ctx)
ctx = v3Toast()(ctx)

// ── 路由（AppLayout 布局——跨路由复用） ──
// v2 组件经 compat 包装（模块级稳定引用——类型安全边界——工厂复用前提）
const AppLayoutCompat = compat(AppLayout)
const LoginCompat = compat(Login)
const RegisterCompat = compat(Register)
const WorkspaceCompat = compat(Workspace)
const ReportsCompat = compat(Reports)
const AgentsCompat = compat(Agents)
const TemplatesCompat = compat(Templates)
const DepartmentsCompat = compat(Departments)
const ChatCompat = compat(Chat)
const SettingsCompat = compat(Settings)
const NewAgentCompat = compat(NewAgent)
const AgentDetailCompat = compat(AgentDetail)
const SandboxesCompat = compat(Sandboxes)
const NewDepartmentCompat = compat(NewDepartment)
const DepartmentDetailCompat = compat(DepartmentDetail)
const NewChatCompat = compat(NewChat)
const ApprovalsCompat = compat(Approvals)
const AdminCompat = compat(Admin)
const layout = (page: any) => h(AppLayoutCompat, {}, page)
const root = document.getElementById('root')!
// ctx.app（登录后跳转——router 引用后绑定）
let router: ReturnType<typeof createRouter>
ctx.app = { navigate: (p: string) => router.navigate(p) }
router = createRouter([
  { path: '/login', render: () => h(LoginCompat, {}) },
  { path: '/register', render: () => h(RegisterCompat, {}) },
  { path: '/', render: () => h(WorkspaceCompat, {}), layout },
  { path: '/dashboard', render: () => h(WorkspaceCompat, {}), layout },
  { path: '/reports', render: () => h(ReportsCompat, {}), layout },
  { path: '/agents', render: () => h(AgentsCompat, {}), layout },
  { path: '/templates', render: () => h(TemplatesCompat, {}), layout },
  { path: '/departments', render: () => h(DepartmentsCompat, {}), layout },
  { path: '/chat/new', render: () => h(NewChatCompat, {}), layout },
  { path: '/chat/:id', render: () => h(ChatCompat, {}), layout },
  { path: '/settings', render: () => h(SettingsCompat, {}), layout },
  { path: '/agents/new', render: () => h(NewAgentCompat, {}), layout },
  { path: '/agents/:id', render: () => h(AgentDetailCompat, {}), layout },
  { path: '/sandboxes', render: () => h(SandboxesCompat, {}), layout },
  { path: '/departments/new', render: () => h(NewDepartmentCompat, {}), layout },
  { path: '/departments/:id', render: () => h(DepartmentDetailCompat, {}), layout },
  { path: '/approvals', render: () => h(ApprovalsCompat, {}), layout },
  { path: '/admin', render: () => h(AdminCompat, {}), layout },
], root, { ctx })
