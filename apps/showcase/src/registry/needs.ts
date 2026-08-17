/**
 * 需求场景表——需求驱动入口（"我要做 X" → 模板/模式/组件/后端全链路映射）
 * 设计（plans/02-learning-experience P0）：场景是组件的引力场——
 * 开发者从需求进入，在场景中"遇到"组件（而非浏览组件列表）。
 */
import type { NeedEntry } from './types.ts'

export const needs: NeedEntry[] = [
  {
    id: 'admin',
    name: '管理后台',
    desc: '侧栏导航 + 仪表盘 + 数据表格 + 表单——最常见的企业应用',
    template: 'admin',
    patterns: ['app-shell', 'dashboard'],
    components: ['Layout', 'Menu', 'Table', 'Form', 'StatCard', 'ThemeSwitch', 'Pagination'],
    backend: ['sql', 'limit'],
    guide: '复制 examples/apps/admin/ → 按改造指南换业务数据 → 加页面',
  },
  {
    id: 'ai-chat',
    name: 'AI 对话应用',
    desc: '流式对话 + 工具调用 + HITL 审批 + 推理展示',
    template: 'multi',
    patterns: [],
    components: ['AiChat', 'ChatInput', 'ToolCallCard', 'ApprovalCard', 'ReasoningBlock', 'SessionList'],
    backend: ['ai', 'sse'],
    guide: 'wire-fake /api/chat 已就绪——接真实 ctx.ai 换端点即可',
  },
  {
    id: 'auth-app',
    name: '登录/权限应用',
    desc: '注册登录 + 受保护页 + 会话持久化',
    template: 'auth',
    patterns: [],
    components: ['AuthPage', 'Form', 'Input', 'PasswordInput', 'Alert'],
    backend: ['auth'],
    guide: '复制 examples/apps/auth/ → 换用户存储（userSystem 中间件）',
  },
  {
    id: 'todo-tool',
    name: '工具型应用',
    desc: '任务/清单/轻量 CRUD——经典起步应用',
    template: 'todo',
    patterns: [],
    components: ['Form', 'Input', 'Checkbox', 'Tag', 'EmptyState', 'PageHeader'],
    backend: ['sql'],
    guide: '复制 examples/apps/todo/ → 改数据模型（api.ts 表结构）',
  },
  {
    id: 'dashboard',
    name: '数据看板',
    desc: 'KPI 指标 + 图表 + 数据表格——分析型页面',
    template: 'admin',
    patterns: ['dashboard', 'data-screen'],
    components: ['StatCard', 'Chart', 'Table', 'Sparkline', 'VirtualTable'],
    backend: ['sql'],
    guide: 'patterns/dashboard 复制 → Chart 数据接真实 API',
  },
  {
    id: 'content-site',
    name: '内容展示站',
    desc: '文档站/落地页/营销页——内容为主',
    template: '',
    patterns: ['docs', 'landing'],
    components: ['Markdown', 'CodeBlock', 'Anchor', 'Card', 'Badge'],
    backend: [],
    guide: 'patterns/docs 或 landing 复制 → 填内容',
  },
  {
    id: 'mobile-app',
    name: '移动端应用',
    desc: '底部 Tab + 安全区 + 移动端适配',
    template: '',
    patterns: ['mobile'],
    components: ['SearchInput', 'List', 'Tabs', 'Drawer', 'Tag'],
    backend: [],
    guide: 'patterns/mobile 复制 → 移动端断点纪律（44px 命中区）',
  },
  {
    id: 'team-collab',
    name: '团队协作工具',
    desc: '多应用编排 + 实时协作',
    template: 'multi',
    patterns: [],
    components: ['SortableList', 'Kanban', 'Tabs', 'AvatarGroup', 'Mentions'],
    backend: ['ws', 'queue'],
    guide: '复制 examples/apps/multi/ → 加子应用（registerApp）',
  },
]
