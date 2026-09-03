/**
 * agent-platform UI 路由（同构——v3-main 客户端启动 + server.ts SSR 共用）
 *
 * 单一实现源（2026-08——A1 首屏 SSR）：路由定义不拆两份（漂移风险）——
 * 客户端 uiServe 接管渲染；服务端 uiSsr 渲染登录/注册首屏。
 */
import { UIRouter, h } from 'weifuwu/vdom'
import type { RenderCtx } from 'weifuwu/vdom'
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
import { Deliverables } from './pages/Deliverables'
import { Surveys } from './pages/Surveys'
import { Workflows } from './pages/Workflows'
import { WorkflowDetail } from './pages/WorkflowDetail'

const page = (Comp: any, props: Record<string, unknown> = {}) =>
  (req: Request, ctx: any) => (ctx as RenderCtx).stream(h(AppLayout, {}, h(Comp, props)))
const router = new UIRouter()
router.get('/login', (req, ctx) => (ctx as RenderCtx).stream(h(Login, {})))
router.get('/register', (req, ctx) => (ctx as RenderCtx).stream(h(Register, {})))
router.get('/', page(Workspace))
router.get('/dashboard', page(Workspace))
router.get('/reports', page(Reports))
router.get('/deliverables', page(Deliverables))
router.get('/agents', page(Agents))
router.get('/templates', page(Templates))
router.get('/departments', page(Departments))
router.get('/chat/new', page(NewChat))
router.get('/chat/:id', (req, ctx) => (ctx as RenderCtx).stream(h(AppLayout, {}, h(Chat, { ...(ctx.params ?? {}) }))))
router.get('/settings', page(Settings))
router.get('/agents/new', page(NewAgent))
router.get('/agents/:id', (req, ctx) => (ctx as RenderCtx).stream(h(AppLayout, {}, h(AgentDetail, { ...(ctx.params ?? {}) }))))
router.get('/sandboxes', page(Sandboxes))
router.get('/departments/new', page(NewDepartment))
router.get('/departments/:id', (req, ctx) => (ctx as RenderCtx).stream(h(AppLayout, {}, h(DepartmentDetail, { ...(ctx.params ?? {}) }))))
router.get('/approvals', page(Approvals))
router.get('/admin', page(Admin))
router.get('/surveys', page(Surveys))
router.get('/workflows', page(Workflows))
router.get('/workflows/:id', (req, ctx) => (ctx as RenderCtx).stream(h(AppLayout, {}, h(WorkflowDetail, { ...(ctx.params ?? {}) }))))

export { router }
