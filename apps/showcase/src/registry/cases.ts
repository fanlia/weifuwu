/**
 * 案例墙——用 weifuwu 构建的应用（传播素材：采用者的证明）
 * type: production（真实产品）/ showcase（框架生态自身）/ template（模板应用）
 */
import type { CaseEntry } from './types.ts'

export const cases: CaseEntry[] = [
  {
    id: 'agent-platform',
    name: 'agent-platform',
    type: 'production',
    desc: '多租户 AI Agent 平台——认证/AI 引擎/实时消息/沙箱/工具链/商业化全家桶',
    highlights: ['中间件全量消费方', '14 页 SPA', '私有化部署', '实战驱动框架开发'],
    url: 'https://github.com/weifuwu/weifuwu/tree/main/apps/agent-platform',
  },
  {
    id: 'showcase',
    name: 'showcase 平台',
    type: 'showcase',
    desc: '本平台自身——weifuwu 发展引擎（用 weifuwu 构建的网站，自举证明）',
    highlights: ['六域 500+ 文档', '157 组件活体', 'SSR + SPA 双轨', 'LLM 友好'],
    url: 'https://weifuwu.dev',
  },
  {
    id: 'todo-app',
    name: '任务管理应用',
    type: 'template',
    desc: 'todo 模板——多页路由 + createStore 跨页状态 + MemorySql 持久化',
    highlights: ['全栈模板', '复制即用'],
    url: 'https://github.com/weifuwu/weifuwu/tree/main/examples/apps/todo',
  },
  {
    id: 'admin-app',
    name: '管理后台应用',
    type: 'template',
    desc: 'admin 模板——AppShell + 多页 + 表格 + KPI',
    highlights: ['Layout 骨架', '路由 layout 包裹'],
    url: 'https://github.com/weifuwu/weifuwu/tree/main/examples/apps/admin',
  },
  {
    id: 'auth-app',
    name: '登录注册应用',
    type: 'template',
    desc: 'auth 模板——登录/注册/受保护页/会话持久化',
    highlights: ['路由守卫', 'AuthPage 组件'],
    url: 'https://github.com/weifuwu/weifuwu/tree/main/examples/apps/auth',
  },
  {
    id: 'multi-app',
    name: '应用编排工作台',
    type: 'template',
    desc: 'multi 模板——父应用嵌子应用（registerApp + 边界事件）',
    highlights: ['多应用', '独立状态'],
    url: 'https://github.com/weifuwu/weifuwu/tree/main/examples/apps/multi',
  },
]
