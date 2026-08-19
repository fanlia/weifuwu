/**
 * 应用模板表——4 教学模板（P2 实现）+ agent-platform 生产级案例（展示层纳入）。
 * 模板源码：examples/apps/:id/（随包发布）——全栈（前端 + server.ts）。
 */
import type { AppEntry } from './types.ts'

export const apps: AppEntry[] = [
  {
    id: 'todo',
    name: '任务管理',
    desc: '经典 CRUD 应用：列表/详情/新建——多页路由 + createStore 跨页状态 + 表单受控。后端：MemorySql 持久化。',
    dir: 'apps/todo',
    usesPatterns: [],
    uses: ['Button', 'Input', 'Checkbox', 'Form', 'Tag', 'EmptyState', 'PageHeader'],
    quality: ['键盘可达', '375/768 无溢出', '亮暗主题', 'loading/error/empty 态', '零控制台错误'],
    files: [
      { name: 'app.tsx', role: '前端：路由表 + 页面组件（TodoList/TodoNew）+ createStore + hash 桥接' },
      { name: 'api.ts', role: '后端：registerTodoApi(app, sql)——CRUD 路由（独立/嵌入共享）' },
      { name: 'server.ts', role: '独立入口：MemorySql + ui + 前端服务（:3300）' },
      { name: 'main.tsx', role: '独立前端入口：createTodoApp + hashchange 桥接' },
    ],
    guide: [
      '1. 改数据模型：编辑 api.ts 的 SQL 表结构（todos 表字段）——MemorySql 与 postgres() 同契约，换库只改 server.ts 一行',
      '2. 加页面：app.tsx 的路由表加一行 { path, render } + 新建页面组件（组件写法见 guides/component-model.md）',
      '3. 改交互/状态：页面组件内 let + ctx.render()（render-only——见 guides/render-only.md）',
      '4. 换样式：组件文档「用法示例」+ layout 原语（wf-* 类，零手写 CSS）',
      '5. 接真实后端：server.ts 把 createMemorySql() 换成 postgres()（见 content/backend/sql.md）',
    ],
  },
  {
    id: 'auth',
    name: '登录注册',
    desc: '登录/注册 → 受保护页 → 登出：应用级状态（user store）+ 路由守卫 + ctx.data。后端：认证中间件。',
    dir: 'apps/auth',
    usesPatterns: [],
    uses: ['Card', 'Form', 'Input', 'PasswordInput', 'Button', 'Alert'],
    quality: ['键盘可达', '表单校验', '错误态', '会话持久化', '零控制台错误'],
    files: [
      { name: 'app.tsx', role: '前端：AuthFormPage（登录/注册两用）+ 路由守卫 + authStore' },
      { name: 'api.ts', role: '后端：registerAuthApi——内存用户表 + token 会话' },
      { name: 'server.ts', role: '独立入口（:3301）' },
      { name: 'main.tsx', role: '独立前端入口' },
    ],
    guide: [
      '1. 换用户存储：api.ts 的 auth_users 表 → 接 userSystem 中间件（见 content/backend/auth.md）',
      '2. 加受保护页：app.tsx 路由表加页面 + 组件内读 authStore.state.user 做守卫（同 DashboardPage 模式）',
      '3. 改会话持久化：app.tsx 的 ctx.browser.storageSet 已处理——key 名 auth:token 可改',
      '4. 加角色权限：守卫处加角色判断（user 表加 role 字段）',
    ],
  },
  {
    id: 'admin',
    name: '管理后台',
    desc: 'AppShell + Dashboard/Table/Form 多页——layout 包裹复用 + 主题。后端：rateLimit + 查询端点。源于 agent-platform 架构提炼。',
    dir: 'apps/admin',
    usesPatterns: ['app-shell'],
    uses: ['Layout', 'Menu', 'NavMenu', 'Table', 'Form', 'ThemeSwitch', 'StatCard', 'Chart', 'Badge', 'Avatar', 'Tag'],
    quality: ['键盘可达', '侧栏折叠', '表格排序', '亮暗主题', 'loading/empty 态'],
    files: [
      { name: 'app.tsx', role: '前端：AppShell（Layout 骨架 + Menu）+ DashboardPage/OrdersPage + 路由 layout 包裹' },
      { name: 'api.ts', role: '后端：registerAdminApi——订单查询 + 种子数据' },
      { name: 'server.ts', role: '独立入口（:3302）' },
      { name: 'main.tsx', role: '独立前端入口' },
    ],
    guide: [
      '1. 换业务数据：api.ts 的 admin_orders 表 + 种子数据 → 自己的业务表（或接真实 postgres）',
      '2. 加页面：app.tsx 路由表加 { path, render, layout: AppShell }——侧栏 Menu items 同步加',
      '3. 改菜单/品牌：AppShell 里 Menu items + 标题文案',
      '4. 表格交互：Table 组件文档（sortable/rowSelection——受控 props 配回调）',
      '5. 参考生产级：apps/agent-platform/（多租户/权限/商业化真实架构）',
    ],
  },
  {
    id: 'multi',
    name: '应用编排',
    desc: '父应用嵌子应用：registerApp/hApp + app:* 边界事件——子应用独立状态。后端：ws 广播。',
    dir: 'apps/multi',
    usesPatterns: [],
    uses: ['Card', 'Button', 'Input', 'Tag', 'Tabs'],
    quality: ['子应用独立状态', '边界事件观测', '零控制台错误'],
    files: [
      { name: 'app.tsx', role: '前端：registerApp 注册 2 个子应用 + 父应用工作台（h(App, {appId}) 嵌入）' },
      { name: 'server.ts', role: '独立入口（:3303——纯前端编排无后端 API）' },
      { name: 'main.tsx', role: '独立前端入口' },
    ],
    guide: [
      '1. 加子应用：app.tsx 里 registerApp(\'my-app\', (props, ctx) => h(MyComp, {})) + 父树 h(App, { appId: \'my-app\' })',
      '2. 子应用传参：h(App, { appId, props: {...} })——app:update 边界事件（见 content/capabilities/app-node.md）',
      '3. 观察边界事件：stream.subscribe 过滤 e.entity === \'app\'（工作台已展示）',
    ],
  },
  {
    id: 'agent-platform',
    name: 'agent-platform（生产级）',
    desc: '多租户 AI Agent 平台——weifuwu 中间件全量消费方（认证/AI/沙箱/工具链/商业化/私有化）。实战驱动框架开发的生产级参考。',
    dir: '',
    usesPatterns: [],
    uses: ['AiChat', 'AuthPage', 'Table', 'Form', 'Modal', 'Drawer', 'Menu', 'StatCard', 'ThemeSwitch'],
    production: true,
    quality: ['真实产品', '多租户', '私有化部署', '商业化闭环'],
  },
]
