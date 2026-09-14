/**
 * agent-platform UI 路由（同构——v3-main 客户端启动 + server.ts SSR 共用）
 *
 * 单一实现源（2026-08——A1 首屏 SSR）：路由定义不拆两份（漂移风险）——
 * 客户端 uiServe 接管渲染；服务端 uiSsr 渲染登录/注册首屏。
 */
import { UIRouter, h } from '../../../client/vdom/index.ts'
import type { RenderCtx } from '../../../client/vdom/index.ts'
import { AppChrome } from './blocks/app-chrome.tsx'
import { Login } from './pages/Login.tsx'
import { Register } from './pages/Register.tsx'
import { Workspace } from './pages/Workspace.tsx'
import { Reports } from './pages/Reports.tsx'
import { Agents } from './pages/Agents.tsx'
import { Templates } from './pages/Templates.tsx'
import { Departments } from './pages/Departments.tsx'
import { Chat } from './pages/Chat.tsx'
import { Settings } from './pages/Settings.tsx'
import { NewAgent } from './pages/NewAgent.tsx'
import { AgentDetail } from './pages/AgentDetail.tsx'
import { Sandboxes } from './pages/Sandboxes.tsx'
import { NewDepartment } from './pages/NewDepartment.tsx'
import { DepartmentDetail } from './pages/DepartmentDetail.tsx'
import { NewChat } from './pages/NewChat.tsx'
import { Approvals } from './pages/Approvals.tsx'
import { Admin } from './pages/Admin.tsx'
import { Deliverables } from './pages/Deliverables.tsx'
import { Surveys } from './pages/Surveys.tsx'
import { Workflows } from './pages/Workflows.tsx'
import { WorkflowDetail } from './pages/WorkflowDetail.tsx'

const page = (Comp: any, props: Record<string, unknown> = {}) =>
  (req: Request, ctx: any) => (ctx as RenderCtx).stream(h(AppChrome, {}, h(Comp, props)))
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
router.get('/chat/:id', (req, ctx) => (ctx as RenderCtx).stream(h(AppChrome, {}, h(Chat, { ...(ctx.params ?? {}) }))))
router.get('/settings', page(Settings))
router.get('/agents/new', page(NewAgent))
router.get('/agents/:id', (req, ctx) => (ctx as RenderCtx).stream(h(AppChrome, {}, h(AgentDetail, { ...(ctx.params ?? {}) }))))
router.get('/sandboxes', page(Sandboxes))
router.get('/departments/new', page(NewDepartment))
router.get('/departments/:id', (req, ctx) => (ctx as RenderCtx).stream(h(AppChrome, {}, h(DepartmentDetail, { ...(ctx.params ?? {}) }))))
router.get('/approvals', page(Approvals))
router.get('/admin', page(Admin))
router.get('/surveys', page(Surveys))
router.get('/workflows', page(Workflows))
router.get('/workflows/:id', (req, ctx) => (ctx as RenderCtx).stream(h(AppChrome, {}, h(WorkflowDetail, { ...(ctx.params ?? {}) }))))

export { router }
