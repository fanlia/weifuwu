/**
 * 指南表——学习路径（正文 = content/guides/:id.md——LLM 开发知识全文）
 * 素材来源：AGENTS.md / docs/*.md / 走查纪律
 */
import type { GuideEntry } from './types.ts'

export const guides: GuideEntry[] = [
  {
    id: 'start',
    name: '快速开始',
    desc: '从零到第一个页面：装包 → 选型 → 取码 → 运行',
    body: `# 快速开始

> LLM 路径：本文件是起点。读完后按需打开 content/ 各域。

## 1. 获取文档（三选一，同一份内容）

- 仓库内：\`content/index.md\`（本文件的上层导航）
- npm 包：\`node_modules/weifuwu/content/index.md\`（版本永远匹配装的代码）
- 文档站：\`npx weifuwu docs\` → http://localhost:4000

## 2. 选型（30 秒决策）

| 要做什么 | 打开 |
|---------|------|
| 用某个组件（Button/Table/Modal…） | \`content/components/<id>.md\`——API 表 + 纪律 + 示例 |
| 拼页面布局（容器/间距/导航壳） | \`content/layout/*.md\`——wf-* 原语族 |
| 完整页面（后台壳/仪表盘/登录…） | \`content/patterns/*.md\`——复制即用 |
| 完整应用（todo/auth/admin/multi） | \`content/apps/*.md\` + \`examples/apps/<id>/\`——复制即改 |
| 后端能力（sql/redis/ws/ai/limit…） | \`content/backend/*.md\`——装配代码 + 活体端点 |
| 框架怎么工作（路由/状态/事件流…） | \`content/capabilities/*.md\` |
| 交付前质量检查 | \`content/guides/quality.md\` |

## 3. 取码

- 组件片段：组件文档「用法示例」节复制
- 完整页面：\`examples/patterns/<file>.tsx\`（复制文件即得页面）
- 完整应用：\`examples/apps/<id>/\` 整个目录（复制 → \`node server.ts\` 即跑）

## 4. 运行

\`\`\`bash
node server.ts   # 或 node --env-file=.env server.ts（需要环境变量时）
\`\`\`

## 5. 验证

1. \`npx weifuwu docs\` 起文档站对照 API
2. 对照 \`content/guides/quality.md\` checklist 逐项自查
3. 交互组件用 agent-browser 真实点击验证（详见组件文档「验证」节）
`,
  },
  {
    id: 'choose',
    name: '选型决策树',
    desc: '组件 vs 原语 vs 页面模式 vs 应用模板——什么场景抄什么',
    body: `# 选型决策树

> 核心原则：**先查框架再动手**——weifuwu 已提供的能力绝不重复造轮子。
> 检查顺序：components → layout 原语 → patterns → apps → capabilities。

## 决策树

\`\`\`
要做一个界面元素？
├─ 已有组件（Button/Input/Table/Modal/Tabs/Tree…135 个）
│   └─ → content/components/<id>.md 查 API + 纪律，直接使用
├─ 是布局结构（容器/间距/对齐/导航壳/响应式显隐）
│   └─ → content/layout/*.md 用 wf-* 原语（零手写 CSS）
│       ├─ 页面骨架 → wf-app-shell / wf-stack / wf-container
│       ├─ 间距/排版 → wf-gap-* / wf-text-* / wf-padding-* 工具
│       └─ 响应式 → wf-hidden@lg / wf-flex@lg 断点变体
└─ 是完整页面/应用
    ├─ 单页结构（后台壳/仪表盘/落地页/移动端）→ content/patterns/*.md 复制
    ├─ 多页应用（路由 + 状态 + 后端）→ content/apps/*.md 复制模板改
    │   ├─ 任务管理 → todo
    │   ├─ 登录/权限 → auth
    │   ├─ 管理后台 → admin
    │   └─ 应用编排 → multi
    └─ 生产级参考 → apps/agent-platform/（真实产品架构）
\`\`\`

## 组件 vs 原语（最常见混淆）

| 场景 | 用组件 | 用原语 |
|------|--------|--------|
| 布局容器/间距/显隐 | ❌ | ✅ wf-stack/wf-grid/wf-gap-* |
| 导航结构（侧栏/菜单项） | ❌ | ✅ wf-nav/wf-nav-item（或 Menu 组件） |
| 可交互元素（按钮/输入/选择） | ✅ 组件 | ❌ |
| 弹层（下拉/弹窗/tooltip） | ✅ 组件（usePopup 基座） | ❌ |
| 纯视觉容器（卡片面/分隔） | 两者皆可 | ✅ wf-surface/wf-border |

## 关键纪律（选型时就要知道）

1. **浮层必须组件 + portal**：dropdown/select/datepicker/menubar/cascader/mentions/contextmenu/tooltip/popover/hovercard/modal/drawer/toast/notification/confirm/tour/command——这些已有组件，直接复用；新弹层组件必须 \`ctx.ui.usePopup\`
2. **受控组件配回调**：传 active/value/checkedKeys 等受控 props 必须同时传 onChange——缺回调 = 静默不可点
3. **列表 key 纪律**：有内部状态的组件列表 + 动态增删重排 → 显式 key；纯元素列表 → 无 key（位置身份）
4. **浏览器能力走 ctx.browser**：禁裸 window/document/localStorage/matchMedia
`,
  },
  {
    id: 'quality',
    name: '人类质量标准',
    desc: 'LLM 交付前验收门槛：可访问性/响应式/主题/动效/状态矩阵/性能/纪律',
    body: `# 人类质量标准（交付前验收清单）

> 用途：开发完成、交付给人类用户前，逐项自查。每一项失败都必须是**拒绝交付**的理由。
> 素材来源：AGENTS.md §8 设计系统纪律 + 组件走查记录（agent-browser 实测沉淀）。

## □ 1. 可访问性（键盘全程可达）

- [ ] Tab 顺序合理；role="button"/tabindex 元素有 Enter/Space 处理
- [ ] 方向键导航组件（Tabs/DatePicker/Menu）焦点跟随激活项
- [ ] 弹层（Modal/Drawer/Dropdown/Popover/Tooltip）Escape 关闭
- [ ] Modal 系焦点 trap + 关闭后焦点归还
- [ ] 危险操作（Confirm）默认 maskClosable=false（防误触）
- [ ] aria 语义：aria-expanded/aria-current/aria-label 正确

## □ 2. 响应式（三断点）

- [ ] 375 / 768 / 1280 三断点无横向溢出
- [ ] 导航正确降级（侧栏 → 顶部条）
- [ ] 表格窄屏横向滚动（Table minWidth）或卡片化
- [ ] 弹层视口夹紧（usePopup 自动）

## □ 3. 主题（亮/暗/自动）

- [ ] 全部颜色走 \`--wf-color-*\` token（无裸色值）
- [ ] 语义文字色用 \`-text\` 变体；实心填充文字用 \`on-brand\`
- [ ] 对比度 ≥ 4.5:1（文字）；focus-ring 含 primary 线（明暗均可见）

## □ 4. 动效

- [ ] 时长/缓动走 \`--wf-dur-*\` / \`--wf-ease-*\`（无硬编码）
- [ ] 退场类 \`--exit\` 成对（有 exit 类必须挂上）
- [ ] reduced-motion 降级（_base.css 自动——勿覆盖）

## □ 5. 状态矩阵

- [ ] loading / error / empty / disabled 四态全覆盖（无缺态渲染）
- [ ] 提交按钮 loading 防重复提交
- [ ] 受控组件有回调（无静默不可点）

## □ 6. 性能

- [ ] 首帧预算合理（大数据列表用 VirtualList/VirtualTable/InfiniteScroll）
- [ ] 无渲染循环（vdom3 防死循环守护不触发）
- [ ] 事件流无 error:caught（浏览器 console 零错误）

## □ 7. 框架纪律

- [ ] 无裸 \`window.\`/\`document.\`/\`localStorage\`（ctx.browser）
- [ ] 渲染只发生在 \`ctx.render()\` 调用处（无隐式触发）
- [ ] 无 eval/new Function；无 npm 运行时依赖（前端）
- [ ] 请求路径无同步 I/O（后端）

## 验证手段（agent-browser 走查纪律）

1. 真实点击（CDP）验证交互——\`eval click\` 绕过命中测试会掩盖问题，两者都测
2. 查 outerHTML（结构）+ getAttribute('style')（定位/显隐）+ getBoundingClientRect（真实可见性）
3. \`closest('#__wf_portal')\` 验证浮层 portal
4. 每次验证前 reload 清状态（会话残留制造假 bug）
5. console --level error 抓加载期错误（hook 需在页面加载前）
`,
  },
  {
    id: 'component-model',
    name: '两阶段组件模型',
    desc: 'mount/render 生命周期职责表 + 事件函数放哪层（AGENTS.md §3.1 展开）',
    body: `# 两阶段组件模型

\`\`\`tsx
const MyComp: Component = (initProps, ctx) => {   // ── mount（只一次）
  let count = initProps.initial ?? 0                    // 状态初始化/订阅/定时器
  return (props) => {                             // ── render（每次渲染）
    return h('button', { onClick: () => { count++; ctx.render() } }, count)
  }
}
\`\`\`

## 职责表

| 阶段 | 职责 | 可访问 | 事件函数 |
|------|------|--------|---------|
| mount | 初始化状态/订阅/定时器/稳定引用回调 | initProps、ctx、mount let、稳定 handle | 只依赖稳定引用 → mount 定义（零重绑） |
| render | 读最新 props/派生数据/输出视图 | 最新 props、mount 闭包、ctx | 依赖最新 props → render 内定义（重绑是正确性要求） |
| ref | DOM 持有/第三方初始化/清理 | el 或 null | **必须 mount 作用域定义**（内联 ref 每渲染新函数 → ref(null) 反复触发） |

## 铁律

1. **renderFn 强制异步**（\`async (props) => Promise<VNode>\`）——两阶段都可 await
2. **渲染只发生在 render() 调用处**——状态是普通对象（let/createStore），无 $ Proxy
3. **工厂按实例执行**——数据必须走 ctx.data（自带缓存+并发合并）
4. mount 捕获的 initProps 不得用于渲染（必须用渲染期 props）
5. 初始状态必须确定性（禁 window.innerWidth 之类直接初始化 → SSR mismatch）

## 相关

- 状态存放：\`let\` + render()（内部）/ createStore + useExternal（共享）
- 完整纪律：AGENTS.md §3/§4
`,
  },
  {
    id: 'render-only',
    name: 'render-only 状态',
    desc: '改状态 → 显式 render()；createStore 跨组件；selfId 精准刷新',
    body: `# render-only 状态

> 唯一规则：**渲染只发生在 \`ctx.render()\` 调用处**。状态是普通 JS 对象——
> 行为可静态推导（代码审查看事件回调里有无 render() 即可验证渲染逻辑）。

## 三通道

| 场景 | 写法 | 触发 |
|------|------|------|
| 组件内部状态 | \`let count\` + 改后 \`ctx.render()\` | 显式调用 |
| 跨组件共享 | \`createStore(init)\` + \`ctx.ui.useExternal(store)\` | store.set/update/notify 自动 |
| 跨组件精准刷新 | mount 时 \`ctx.ui.selfId('name')\` → 任意处 \`ctx.render(['name'])\` | 显式调用 |

\`\`\`tsx
// 内部状态
const Counter = (_init, ctx) => {
  let count = 0
  return (props) => h('button', {
    onClick: () => { count++; ctx.render() },
  }, count)
}

// 共享状态（模块级单例）
const store = createStore({ user: null })
const UserBadge = (_init, ctx) => {
  const s = ctx.ui.useExternal(store)   // 订阅：变化 → 自身重渲染
  return (props) => h('span', {}, s.state.user?.name ?? '未登录')
}
store.set({ user })                      // 任何位置 → 订阅组件自动重渲染
\`\`\`

## 不需要渲染的状态

\`let el\` / \`let timerId\` 等内部缓存——改后**不**调 render()（参考 AGENTS.md §4.1 表）。

## hooks（事件驱动——非赋值自动）

useMedia/useInView/useChat 等是浏览器事件驱动重渲染——与"赋值自动"本质不同，保留合理。

## 历史教训

v1 的 $ Proxy 在重挂载场景捕获的 selfId 与当前实例错位 → 交互静默失效。
render-only 根治：render() 闭包绑定组件 id——无 this/selfId 错位。
`,
  },
  {
    id: 'custom-component',
    name: '自定义组件开发指南',
    desc: 'usePopup / useControlled / 动画 / AI 组件 / 类型纪律 / 测试写法（从 docs 迁移）',
    body: '（正文见 content/guides/custom-component.md——文件优先）',
  },
  {
    id: 'page-building',
    name: '页面组装方法论',
    desc: '从零搭页面：页面解剖学五层 + 组装 5 步套路 + 完整示例（"第一行写什么"）',
    body: '（正文见 content/guides/page-building.md——文件优先）',
  },
  {
    id: 'layout-choice',
    name: '布局选型指南',
    desc: '什么时候用哪个原语：决策树（骨架/分区/间距/定位/响应式）+ 组件与原语边界',
    body: '（正文见 content/guides/layout-choice.md——文件优先）',
  },
  {
    id: 'production',
    name: '生产级案例',
    desc: 'agent-platform 架构提炼：中间件全家桶装配、14 页 SPA 组织、商业化能力',
    body: `# 生产级案例（agent-platform）

> 来源：\`apps/agent-platform/\`——多租户 AI Agent 平台，weifuwu 中间件全量消费方。
> 定位：**实战驱动框架开发的生产级参考**——showcase 的教学模板由此提炼，框架能力先在此实战验证。

## 中间件全家桶装配（真实顺序即依赖顺序）

\`\`\`ts
import { serve, Router, cors, postgres, redis, ui, userSystem, ai, messager, rateLimit, verifyPassword, email } from 'weifuwu'

const app = new Router()
app.use(cors())
app.use(postgres())          // ctx.sql——契约层（引擎实现）
app.use(redis())             // ctx.redis——独立连接工厂 createConnection()
app.use(userSystem())        // ctx.user/ctx.auth——登录态
app.use(ai())                // ctx.ai——chat/stream/agent/approve
app.use(messager())          // 实时消息
app.use(rateLimit({ redis: r.redis, windowMs: 60_000, max: 100 }))  // ctx.limit
app.use(ui())                // ctx.ui——前端
\`\`\`

## 架构决策（可复用的模式）

1. **路由按域注册**：\`registerAuthRoutes / registerAgentRoutes / ...\`——每域一个函数（showcase 模板的 registerXxxApi 同源）
2. **14 页 SPA**：单一前端入口 + 路由表——见 \`src/ui/routes.ts\`
3. **服务层独立**：services/（chat/agent-runner/sandbox）不依赖路由层——可单测
4. **沙箱隔离**：sandbox/（docker + host 管理）——Agent 执行环境
5. **商业化能力**：订阅分层/租户管理/邀请/白标/私有化——见 apps/agent-platform/README.md

## 学习路径

1. 先跑起来：\`cd apps/agent-platform && node --env-file=.env server.ts\`
2. 读 \`src/middleware/ctx.ts\`（AppCtx——中间件注入面全貌）
3. 对照 showcase 教学模板（todo/auth/admin/multi）理解"模板 = 生产架构的简化提炼"

> 纪律：**实战先行、文档跟进**——框架能力变更先在 agent-platform 验证，再沉淀进 showcase 文档。
`,
  },
  {
    id: 'frontend',
    name: '前端总览与 API 速查',
    desc: '从 docs/frontend.md 迁移（叙述性指南——正文见 content/guides/frontend.md）',
    body: '（正文见 content/guides/frontend.md——文件优先）',
  },
  {
    id: 'components-guide',
    name: '组件库使用示例速查',
    desc: '从 docs/components.md 迁移（叙述性指南——正文见 content/guides/components-guide.md）',
    body: '（正文见 content/guides/components-guide.md——文件优先）',
  },
  {
    id: 'middleware',
    name: '中间件与 ctx 注入链',
    desc: '从 docs/frontend-middleware.md 迁移（叙述性指南——正文见 content/guides/middleware.md）',
    body: '（正文见 content/guides/middleware.md——文件优先）',
  },
  {
    id: 'server-guide',
    name: '后端开发指南',
    desc: '从 docs/server.md 迁移（叙述性指南——正文见 content/guides/server-guide.md）',
    body: '（正文见 content/guides/server-guide.md——文件优先）',
  },
  {
    id: 'data-guide',
    name: '数据层指南（sql/redis）',
    desc: '从 docs/data.md 迁移（叙述性指南——正文见 content/guides/data-guide.md）',
    body: '（正文见 content/guides/data-guide.md——文件优先）',
  },
  {
    id: 'realtime-guide',
    name: '实时能力指南（ws/sse）',
    desc: '从 docs/realtime.md 迁移（叙述性指南——正文见 content/guides/realtime-guide.md）',
    body: '（正文见 content/guides/realtime-guide.md——文件优先）',
  },
  {
    id: 'saas-guide',
    name: 'SaaS 能力指南（auth/limit/email/queue/cron）',
    desc: '从 docs/saas.md 迁移（叙述性指南——正文见 content/guides/saas-guide.md）',
    body: '（正文见 content/guides/saas-guide.md——文件优先）',
  },
  {
    id: 'layout-guide',
    name: '布局原语使用指南',
    desc: '从 docs/layout.md 迁移（叙述性指南——正文见 content/guides/layout-guide.md）',
    body: '（正文见 content/guides/layout-guide.md——文件优先）',
  },
  {
    id: 'styling',
    name: '样式体系指南',
    desc: '从 docs/styling.md 迁移（叙述性指南——正文见 content/guides/styling.md）',
    body: '（正文见 content/guides/styling.md——文件优先）',
  },
  {
    id: 'mobile-guide',
    name: '移动端开发指南',
    desc: '从 docs/mobile.md 迁移（叙述性指南——正文见 content/guides/mobile-guide.md）',
    body: '（正文见 content/guides/mobile-guide.md——文件优先）',
  },
  {
    id: 'ui-dom-guide',
    name: '前端运行时指南（UIRouter/渲染器）',
    desc: '从 docs/frontend-ui-dom.md 迁移（叙述性指南——正文见 content/guides/ui-dom-guide.md）',
    body: '（正文见 content/guides/ui-dom-guide.md——文件优先）',
  },
]
