# weifuwu

**自托管全栈框架** — 一个 npm 包 = 后端 HTTP + 前端 VDOM + 115 组件 + CSS 设计系统 + SaaS 地基（认证 / 消息 / 队列 / AI）。全自研、零构建、消灭样板。

```bash
npm install weifuwu      # 一个依赖，完整应用栈
```

**定位**：面向需要完整应用栈、又不想缝合多个框架/服务、且重视代码与数据所有权的开发者——独立开发者、小团队、自托管/私有化部署。尤其当应用包含 **认证 + 实时消息 + AI 对话 + 后台管理** 时，weifuwu 把这些「每个应用都要的地基」全部内置为一行 `app.use(...)`。

### 五个关键卖点

| 卖点 | 为什么重要 |
|------|-----------|
| **一个包，零构建** | 服务端 `node --import weifuwu/dev` 直跑 `.tsx`；浏览器 CDN import map 即用；CSS 一条 link 即得完整设计系统——没有构建步骤、没有脚手架 |
| **协议层全自研** | PG v3 / RESP2 / GraphQL schema / OpenAI 流式协议全部自研——确定性、可预测、错误模型统一；诚实裁剪：**不支持的能力明确报错，绝不静默降级** |
| **消灭样板** | 动态编译免构建、`ctx.data.get` 一个 API 覆盖 SSR 预取/hydration/SPA、自研 DB 客户端免双重编码与 parseRow 样板 |
| **SaaS 地基随包内置** | rateLimit / email / userSystem / messager / queue / ai 六个中间件**互相咬合**（身份是消息的路由）——从「自建基础设施」变「声明业务」 |
| **自托管友好** | 运行时仅 esbuild + graphql + ws；部署 = 一个 Node 进程 + Postgres + Redis；数据、代码、模型全部在自己手里 |

### 一个包 = 五层能力

| 层 | 入口 | 能力 |
|----|------|------|
| 后端 | `weifuwu` | Trie 路由 / 中间件链 / serve / 自研 PG+Redis / SSR / GraphQL / WebSocket |
| 前端 | `weifuwu/ui-dom` | **UIRouter（纯路由 + ctx 注入链）+ uiServe（渲染运行时）+ SSR/hydration**——handler=异步组件 / 中间件两阶段 / ctx.params 对齐后端；**weifuwu/components 直接复用**（VNode 契约唯一来源 ui-dom，见 `docs/frontend-ui-dom.md`） |
| 组件 | `weifuwu/components` | 115 个 HTML 原语组件（表单/表格/弹层/AiChat…），引用 `--wf-*` 主题变量 |
| 样式 | `weifuwu/layout` | 58 布局原语 + 136 工具类 + 167 主题 Token，零自定义 CSS 文件 |
| SaaS 地基 | 随包内置 | rateLimit / email / userSystem / messager / queue / ai → `ctx.*` 一行接入 |

> ⚠️ **注意：前后端都有 `ctx.ui`，但用途完全不同**
> - **后端** `ctx.ui`（SSR/编译）：`ctx.ui.html`（HTML 模板）、`ctx.ui.js`（TSX→JS 动态编译）、`ctx.ui.css`（CSS 编译）、`ctx.ui.ssr`（组件 SSR）、`ctx.ui.ssrData`（数据序列化）
> - **前端** `ctx.ui`（渲染引擎，20+ hooks）：
>   - 渲染：`render()`（唯一触发——render-only）/ `selfId()`（跨组件精准刷新）
>   - 状态：`useControlled()`（受控/非受控）/ `useStableRef()`（稳定 ref）/ `useExternal()`（共享状态订阅）
>   - 弹层：`usePopup()`（统一能力层——锚定浮层 + 会话级模态）/ `usePopupPosition()`（定位）
>   - 事件：`useInView()` / `useScrollPosition()` / `useMedia()` / `useBreakpoint()` / `useGlobalKey()` / `useDrag()` / `useDragDrop()` / `useHoverCapable()` / `useLongPress()` / `useVisualViewport()`
>   - 动画：`useAnimationEnd()`（完成回调）/ `usePresence()`（显隐状态机）/ `useTween()`（数值补间）/ `useReducedMotion()`（偏好感知）
>   - AI/数据：`useChat()`（AI 会话）/ `useAsync()`（异步取数）
> 后端的是「把页面和代码交给浏览器」，前端的是「在浏览器里驱动 UI」。

### 与主流方案的关系

| | weifuwu | Express + React 等 | Next.js 全家桶 |
|--|---------|------------------|----------------|
| 依赖 | **1 个包** | 5+ 个框架/库 | 生态绑定 |
| 构建 | **零**（动态编译直跑 `.tsx`） | 需要 | 需要 |
| DB 客户端 | **自研协议**（零依赖，确定性输出） | pg + 连接池 | Prisma 等 |
| AI / Agent | **内置**（agent 循环 + 工具调用 + HITL 审批 + 流式 UI） | 自接 ai-sdk | 自接 |
| 认证 / 消息 / 队列 | **随包内置、互相咬合** | 自选 + 自缝 | 自选 + 自缝 |
| 部署 | 一个 Node 进程 + PG + Redis | 各组件自理 | 平台绑定 |

> 定位不是「替代某个框架」，而是**包换包**：用 weifuwu 一个依赖替换你原本要缝合的整套栈。心智模型有借鉴（两阶段组件接近 React、中间件接近 Express），但每一层都是自研的确定性实现——组件模型见[核心概念](#核心概念)，与 antd/Element Plus/shadcn 的对应见 [docs/components-map.md](docs/components-map.md)。

### 从这里开始

| 你想… | 去哪 |
|--------|------|
| 10 分钟跑通 SPA + SSR | [快速开始](#快速开始) |
| 立刻体验（跑现成 demo） | 快速开始的「30 秒体验」 |
| 零后端原型（一个 HTML 文件） | [CDN 快速原型](#cdn-快速原型零构建纯-html) |
| 按任务找 API（认证/消息/AI/移动端…） | [能力速查](#能力速查任务--api) |
| 读完整 API 参考 | [文档导航](#文档导航) |

---

## 设计理念

> 顶部「定位」回答了**是什么 / 为什么**；以下是**哲学展开**——四条核心哲学与十一条技术原则。

### 核心哲学

**① 一个包，全栈一体。** 后端、前端、组件、样式装在一个 npm 包里，零配置、零构建、纯 link 可用：服务端 `--import weifuwu/dev` 直接跑 `.tsx`（Node loader + esbuild 同步编译）；浏览器 CDN import map 直接跑；CSS 一条 link 即得完整设计系统。

**② 全自研，诚实裁剪。** VDOM、PG v3 / RESP2 协议、GraphQL schema、OpenAI 兼容流式协议——全部自研而非包装他人。动机不是炫技而是**确定性**：自研客户端输出确定、行为可预测、错误模型统一。配套纪律是诚实裁剪：**不支持的能力明确抛 `ProtocolError('unsupported')`，绝不静默降级或"尽量支持"**（已裁剪清单见组件裁剪登记）。

**③ 消灭样板。** 框架的每一层都在消灭一类样板代码：

| 样板 | 消灭方式 |
|---|---|
| 构建样板 | 动态编译（`ctx.ui.js` / `weifuwu/dev`），改代码即刷即用，零构建步骤 |
| 样式样板 | 语义原语 + 变量定制，零自定义 CSS 文件（`--wf-brand-500` 改一层值全站跟随） |
| 数据样板 | `ctx.data.get` 一个 API 覆盖 SSR 预取 / hydration 命中 / SPA fetch，写数据像写同步代码 |
| 协议样板 | 自研 PG/Redis 客户端消灭双重编码、parseRow 样板、`'EX'` 参数顺序陷阱 |

**④ SaaS 地基，应用必须的一等能力。** 不只是库——rateLimit / email / userSystem / messager / queue 五个中间件随包内置，且互相咬合：**身份是消息的路由，消息是身份的交互**（`sendTo(ctx.user.id)` 按身份路由、`createConversation(ctx.user.id)` 创建者即身份、成员校验自动对齐），AI 对话走同一协议。开发者从「自建基础设施」变「声明业务」——`app.use(...)` 一行接入，一个多租户 AI 平台（agent-platform）已完整消费这层地基（auth / AI / 消息 / UI / 数据管道全部框架能力）。

### 技术原则（哲学的展开）

**零运行时依赖** — 前端无 npm 运行时依赖（自研 VDOM，不引入 Virtual DOM 库、rxjs、immer 等）。后端仅依赖 `esbuild`（TSX→JS 编译）+ `graphql` + `ws`（语言/协议本身）——**数据库客户端（PostgreSQL/Redis 协议）、GraphQL schema 工具全部自研**。esbuild 作为运行时依赖随 `npm install weifuwu` 自动安装，`ctx.ui.js()` 开箱即用。

**两阶段组件模型** — 组件 = `async (initProps, ctx) => (props) => Promise<VNode>`。外层工厂只执行一次（mount，可 await 数据），内层 renderFn 每次状态/props 变化时执行（强制异步）。无 class、无 `this`、无 Hook——**位置即语义**：外层天生只跑一次，没有 hooks 规则、没有依赖数组、没有闭包陷阱（详解见[核心概念](#核心概念)）。

**render-only 确定性渲染** — 渲染唯一触发 `ctx.ui.render()`（闭包绑定组件），状态是普通对象（`let` + `render()`）；跨组件共享用 `createStore` + `ctx.ui.useExternal()`。行为可静态推导，无隐式触发（详见[组件库](docs/components.md)）。

**VDOM 输出透明（写 JSX，看 DOM 即真相）** — VDOM 对用户输入零 magic：条件渲染的 false 在 DOM 里是诊断占位注释（`<!--wf-hole: false-->`），数组项 key 与组件实例 id 直接落 DOM（`data-wf-key` / `data-wf-id`）——devtools 看到的 DOM 就是引擎决策的可读输出；非法输入占位 + warn，不崩溃不静默。转化契约唯一清晰：用户写什么，vnode 就是什么，DOM 就长什么样（规则表为内部开发契约）。

**中间件注入一切** — 后端和前端共用同一理念：中间件向 `ctx` 注入能力（`ctx.sql` / `ctx.redis` / `ctx.api` / `ctx.auth` / `ctx.i18n` / `ctx.limit` / `ctx.email` / `ctx.queue` / `ctx.ai` / `ctx.msg` 等），Handler/组件从 `ctx` 读取。

**async 工厂组件** — `async (initProps, ctx) => (props) => Promise<VNode>`（weifuwu **唯一组件形态**——同步组件已不支持）：工厂层声明数据（`await ctx.data.get`）、mount 初始化状态（`let` + `render()`）、render 输出视图。异步在工厂边界与 renderFn，数据经闭包注入，写数据像写同步代码。三条纪律见[核心概念 · async 组件](#核心概念)。

**SPA/SSR/Hydration 统一透明** — 同一份路由定义（`UIRouter`）一个组件三场景自动适配：后端 `ssrPage(router, { url })` 匹配即自动 SSR（完整 HTML + `__DATA__`），客户端 `uiServe(router, { root, hydrate: true })` 按 URL 同源匹配并收养服务端 HTML（不重建、无闪跳）。`ctx.data.get` 一个 API：SSR 预取 / hydration 命中（不重复请求）/ SPA 触发 fetch。服务端直接用 `.tsx`（`weifuwu/dev` Node loader），前后端同一 JSX 运行时。

**AI 是一等公民** — 自研 OpenAI 兼容协议（`docs/ai-contract.md`）+ 零依赖流式客户端 + agent 工具循环 + HITL 人工审批 + embedding 向量化。后端 `ctx.ai` 一个入口：`chat()` / `stream()` / `agent()`（`stream(messages, { emit })` emitter 抽象——事件可接任意通道，`runToResult()` 结构化结果）/ `approve()` / `embed()` / `embedMany()`；前端 `ctx.ui.useChat()`（会话语义）+ `AiChat` 组件（标准对话界面）——流式 token / 工具调用卡 / 审批卡开箱即用，协议对页面完全透明，不用 ai-sdk。

**SaaS 地基随包内置** — rateLimit（限流）/ email（邮件）/ userSystem（用户认证）/ messager（消息系统）/ queue（可靠队列）以中间件形态随包提供，`app.use(...)` 一行接入（详见[SaaS 地基模块](docs/saas.md)）。互相咬合成协作基础：身份（userSystem）+ 消息（messager）的组合让「谁能跟谁说话、消息如何送达」天然对齐，不再需要第三套权限系统。

**机制与策略分离** — 框架管**机制**（token 怎么签、消息怎么送达、agent 循环怎么跑），开发者管**策略**（谁能建群、租户隔离 SQL、技能注册表）。这是「诚实裁剪」的积极面：**框架不越界，应用层不被绑架**——agent-platform 迁移验证了边界：多租户隔离（`WHERE tenant_id`）、技能编排、聊天产品模型留在应用层，框架守住通用能力（auth / ai / messager / UI / 数据管道）。

**零自定义 CSS 设计系统** — 一个 CSS 文件 = 双层 Token + 布局原语 + 工具类 + 组件样式。业务页面不写 style.css：组件 + `wf-*` 原语写业务，品牌/组件定制改变量（`--wf-brand-500` / `--wf-btn-radius`），暗色自动（详见[布局系统](docs/layout.md)）。

**自研数据层** — `ctx.sql`（PG v3 协议）与 `ctx.redis`（RESP2 协议）为**自研客户端**：确定性输出、行为可预测、统一错误模型。jsonb 自动解码、TTL 安全 API、schema 写前校验——高频痛点（双重编码/parseRow 样板/`'EX'` 参数顺序）从根上消除。

> **实践验证**：多租户 AI 平台（`apps/agent-platform`——14 页 + 部门聊天 + 知识库 + HITL 审批）已完全运行在框架上：auth（userSystem）/ AI 引擎（ai）/ 实时消息（messager）/ UI（115 组件）/ 数据管道（ctx.api）零自研替代。框架哲学（中间件注入、诚实裁剪、机制与策略分离）经受住了真实复杂应用的检验——这也是我们确定「哪些进框架、哪些留应用层」的依据。

---

## 快速开始

两种模式，**组件和路由的写法完全一样**，差异只有后端/客户端入口两行：

| 模式 | 适用场景 | 后端 | 客户端入口 |
|------|---------|------|-----------|
| **SPA** | 应用页（Dashboard、工具、后台） | HTML 外壳 | `uiServe(router, { root: '#root' })` |
| **SSR + Hydration** | 内容页（博客、营销，需要 SEO/首屏） | `ssrPage(router)` 一行 | `uiServe(router, { root: '#root', hydrate: true })` |

### 先写共享部分（两种模式都一样）

```tsx
// routes.tsx —— 页面声明（前后端共用 UIRouter）
import { UIRouter } from 'weifuwu/ui-dom'

const app = new UIRouter()

// async 组件（原生）：await 数据 → 返回视图（外层初始化，内层渲染）
const Home = async (_init, ctx) => {
  const msg = await ctx.data.get('/api/hello')   // 数据管道：一个 API 三场景
  return async (props) => <h1>{msg.msg}</h1>
}

app.get('/', async () => <Home />)   // handler = 异步组件

export { app }
```

### 模式 A：纯 SPA

```ts
// server.ts
import { serve, Router, ui, cors } from 'weifuwu'
import { app } from './routes.tsx'

const router = new Router()
router.use(cors())
router.use(ui())   // 注入 ctx.ui.html / ctx.ui.js / ctx.ui.css

// SPA 外壳（空 root + 前端 bundle）
router.get('/', (req, ctx) => ctx.ui.html`
  <!doctype html><html><body>
    <div id="root"></div>
    <script src="/static/app.js"></script>
  </body></html>
`)
router.get('/static/app.js', (req, ctx) => ctx.ui.js('./src/client.ts'))
router.get('/api/hello', () => Response.json({ msg: 'world' }))

serve(router, { port: 3000 })
```

```ts
// src/client.ts —— 纯客户端渲染
import { uiServe } from 'weifuwu/ui-dom'
import { app } from './routes.tsx'

uiServe(app, { root: '#root' })   // 监听 location → 执行路由 → VDOM 落地
```

### 模式 B：SSR + Hydration（内容页/SEO）

同一份 `router`、同一个组件，差异只在**后端加 `ssrPage` 一行、客户端加 `hydrate` 参数**：

```ts
// server.ts —— 完整版（与模式 A 的差异：ssrPage + 一条样式路由）
import { serve, Router, ui, cors } from 'weifuwu'
import { ssrPage } from 'weifuwu/ui-dom'
import { app } from './routes.tsx'

const router = new Router()
router.use(cors())
router.use(ui())

// 路由级 SSR：GET 匹配共享 router → 注入 ctx.params → await 组件工厂
// → 完整 HTML + __DATA__ + bundle/styles 引用（无需手写页面 handler）
router.get('*', async (req, ctx) => {
  const { page } = await ssrPage(app, { url: req.url ?? '/' })
  return ctx.ui.html.unsafe(page)   // page 是完整 HTML（ssrPage 已序列化 __DATA__）——unsafe 防二次转义
})

router.get('/static/app.js', (req, ctx) => ctx.ui.js('./src/client.ts'))
router.get('/static/style.css', (req, ctx) => ctx.ui.css('./src/style.css'))
router.get('/api/hello', () => Response.json({ msg: 'world' }))

serve(router, { port: 3000 })
```

```ts
// src/client.ts —— 与模式 A 的唯一差异：hydrate: true（收养服务端 HTML，无闪跳）
import { uiServe } from 'weifuwu/ui-dom'
import { app } from './routes.tsx'

uiServe(app, { root: '#root', hydrate: true })
```

### 启动（两种模式都一样）

```json
// package.json —— 服务端直接跑 .tsx（零构建）
{ "scripts": { "dev": "node --import weifuwu/dev server.ts" } }
```

- 访问页面：SPA 客户端渲染；SSR 页面内容直接进 HTML（`curl /` 可见，SEO）
- 改组件刷新即生效，无需构建步骤
- 完整可运行示例见 `apps/components-demo`（组件 cheatsheet）与 `apps/agent-platform`（全栈 SaaS 应用）

> 需要 **Node.js ≥ 20.6**（`--import weifuwu/dev` 与 `node --test` 依赖）。

### 30 秒体验（跑现有 demo）

```bash
# ① 组件 cheatsheet——115 组件全部可交互预览（零依赖，5 秒起）
cd apps/components-demo && node server.ts
# 打开 http://localhost:3000

# ② 全栈 SaaS 示例——多租户 AI 平台（auth / AI 对话 / 部门聊天 / 知识库 / HITL 审批）
docker compose up -d postgres redis   # 仓库根目录
cd apps/agent-platform && npm run seed && npm run dev
# 打开 http://localhost:3000（admin@demo.com / admin123）
```

> 想**零后端、零构建**最快跑起来？直接跳到下面的「CDN 快速原型」——一个 `.html` 文件即可。

---

## CDN 快速原型（零构建、纯 HTML）

不需要 Node.js 或构建工具，直接在浏览器中用 CDN 使用 weifuwu。创建一个 `.html` 文件即可开始，适合快速原型、Codepen、简单的演示页面。

```html
<!-- cdn-counter.html -->
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weifuwu CDN 示例</title>

  <!-- 组件样式（可选，如只用 weifuwu/ui-dom 则不需要） -->
  <link
    rel="stylesheet"
    href="https://unpkg.com/weifuwu@latest/dist/components/style.css"
  />
</head>
<body>
  <div id="root"></div>

  <!-- Import Map — 将 weifuwu 包名映射到 CDN 地址 -->
  <script type="importmap">
    {
      "imports": {
        "weifuwu/ui-dom": "https://unpkg.com/weifuwu@latest/dist/ui-dom/index.js",
        "weifuwu/components": "https://unpkg.com/weifuwu@latest/dist/components/index.js"
      }
    }
  </script>

  <script type="module">
    import { UIRouter, uiServe, h } from 'weifuwu/ui-dom'
    import { Card, Button, Badge } from 'weifuwu/components'

    // 组件 = async (initProps, ctx) => (props) => Promise<VNode>（render-only：改状态后 ctx.ui.render()）
    const Counter = async (_init, ctx) => {
      let count = 0 // mount 初始化

      return () =>
        h(Card, { variant: 'default', padding: 'lg' },
          h('h2', { style: { textAlign: 'center', margin: 0 } }, '⚡ Weifuwu'),
          h('div', { style: { fontSize: '4rem', fontWeight: 600, textAlign: 'center' } },
            String(count)),
          h('div', { style: { textAlign: 'center', marginTop: '1rem' } },
            h(Badge, {
              variant: count % 2 === 0 ? 'success' : 'warning'
            }, count % 2 === 0 ? '偶数' : '奇数')),
          h('hr', { style: { margin: '1rem 0', border: 'none', borderTop: '1px solid #eee' } }),
          h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'center' } },
            h(Button, { variant: 'secondary', onClick: () => { count--; ctx.ui.render() } }, '➖ 减 1'),
            h(Button, { variant: 'danger', onClick: () => { count = 0; ctx.ui.render() } }, '↺ 重置'),
            h(Button, { variant: 'primary', onClick: () => { count++; ctx.ui.render() } }, '➕ 加 1'),
          ),
        )
    }

    // 路由 + 渲染：监听 location → 执行 handler → VDOM 落地
    const app = new UIRouter()
    app.get('/', () => h(Counter, {}))
    uiServe(app, { root: '#root' })
  </script>
</body>
</html>
```

将此 HTML 保存到本地用浏览器打开即可运行。

### CDN 资源地址说明

| 资源 | CDN 地址 | 说明 |
|------|---------|------|
| `weifuwu/ui-dom` | `https://unpkg.com/weifuwu@latest/dist/ui-dom/index.js` | 前端运行时（UIRouter, uiServe, h, 状态管理等） |
| `weifuwu/components` | `https://unpkg.com/weifuwu@latest/dist/components/index.js` | 115 个 UI 组件（Button, Card, Table, Modal, Icon 等） |
| `weifuwu/components` | `https://unpkg.com/weifuwu@latest/dist/components/style.css` | 组件 CSS + 167 个主题 Token + 58 个布局原语 + 136 个工具类 |
| 独立布局系统 | `https://unpkg.com/weifuwu@latest/dist/layout/weifuwu-layout.css` | 仅 CSS 布局，不依赖 JS |


---

## 模块总览

| 导入路径 | 模块 | 用途 | 依赖 |
|---------|------|------|------|
| `weifuwu` | **Router** | Trie 路由 + 中间件链 + WebSocket + GraphQL | — |
| `weifuwu` | **serve** | HTTP 服务器 | Router |
| `weifuwu` | **cors** | CORS 跨域中间件 | Router |
| `weifuwu` | **serveStatic** | 静态文件服务（ETag/304/目录索引） | Router |
| `weifuwu` | **postgres** | PostgreSQL 客户端（自研 PG v3 协议）→ `ctx.sql`；**Query Language**（`sql.query` AST 双后端——真库编译 SQL / 内存直执行） | Router, DATABASE_URL |
| `weifuwu` | **redis** | Redis 客户端（自研 RESP2 协议）→ `ctx.redis` | Router, REDIS_URL |
| `weifuwu/db` | **Memory 实现** | `createMemorySql()` / `MemoryRedis`——生产契约黑盒实现（开发/测试/单实例零数据库）；`MemoryRedisServer`/`MemoryPostgresServer`——进程内线协议服务器（协议测试零 docker） | — |
| `weifuwu` | **ui** | SSR 渲染 + esbuild JS/CSS 动态编译 → `ctx.ui` | Router |
| `weifuwu/ui-dom` | **uiServe** | 渲染运行时：监听 location → 执行路由 → VDOM 落地（`hydrate: true` 收养 SSR HTML） | UIRouter |
| `weifuwu/ui-dom` | **ssrPage** | 路由级 SSR：匹配共享 router → 自动完整 HTML + `__DATA__` | Router, ui |
| `weifuwu` | **rateLimit** | 限流中间件（fixed/sliding，redis 多实例原子）→ `ctx.limit` | Router, redis |
| `weifuwu` | **email** | 邮件发送（Resend/SMTP 自研/自定义适配器）→ `ctx.email` | Router |
| `weifuwu` | **userSystem** | 用户系统（scrypt 密码哈希 + 混合会话 + 多租户感知）→ `ctx.user` / `ctx.auth` / `ctx.tenantId` + `/api/auth/*` | Router, postgres |
| `weifuwu` | **messager** | 消息系统（会话/消息持久化 + WS 实时投递 + Redis 跨进程广播）→ `ctx.msg` + `/api/messages/*` | Router, postgres, (redis) |
| `weifuwu` | **queue** | 可靠任务队列（Redis Streams，at-least-once + DLQ）→ `ctx.queue` | Router, redis |
| `weifuwu` | **scheduler** | 计划任务（延时 `ctx.schedule` + cron `ctx.cron`/`ctx.cancelCron`，触发后入队） | Router, redis, queue |
| `weifuwu` | **ai** | LLM 对话（自研 OpenAI 兼容协议 + 自研 SSE 解码，默认 DeepSeek）→ `ctx.ai` + embedding + `ctx.ui.useChat` + `AiChat` | Router |
| `weifuwu/dev` | **dev loader** | Node loader：服务端直接跑 `.ts/.tsx`（`--import weifuwu/dev`） | esbuild |
| `weifuwu` | **graphql** | GraphQL 端点（支持 GraphiQL） | Router |
| `weifuwu` | **createMiddleware** | 类型安全中间件工厂 | — |
| `weifuwu` | **ok / badRequest / …** | HTTP 响应辅助函数（ok/badRequest/... 等 12 个） | — |
| `weifuwu` | **parseBody** | JSON 请求体安全解析 | — |
| Router 方法 | **app.graphql()** | GraphQL 端点（支持 GraphiQL），Router 实例方法（无需单独 import） | Router |
| `weifuwu/ui-dom` | **UIRouter** | 纯路由 + ctx 注入链（`use` 中间件累积类型，对齐后端 `app.use`）；handler=异步组件 | — |
| `weifuwu/ui-dom` | **uiServe** | 渲染运行时：监听 location → 执行路由 → VDOM diff/patch；`hydrate: true` 收养 SSR HTML | UIRouter |
| `weifuwu/ui-dom` | **async 组件** | async 函数即组件（与同步同签名）；数据走 ctx.data 三场景（三条纪律见[核心概念](#核心概念)） | — |
| `weifuwu/ui-dom` | **ctx.data** | 数据管道：SSR 预取 / hydration 命中 / SPA fetch（`ctx.data.get`） | uiServe |
| `weifuwu/ui-dom` | **api / auth / ws** | HTTP 客户端 / 认证 / WebSocket 中间件 | — |
| `weifuwu/ui-dom` | **i18n** | 国际化中间件（运行时切换语言） | — |
| `weifuwu/ui-dom` | **ssrPage / serializeData** | 服务端渲染：SSR HTML + `__DATA__` 序列化（`ctx.params` 两端同源） | — |
| `weifuwu/ui-dom` | **useChat / AiChat 原语** | AI 会话（流式/工具调用/HITL） | — |
| `weifuwu/ui-dom` | **事件原语** | `usePopup`（统一弹窗能力层）/ `usePresence` / `useInView` / `useScrollPosition` / `useGlobalKey` / `useDrag` / `useDragDrop` / `useAnimationEnd` / `useTween` / `useReducedMotion`（浏览器事件/动画统一入口，见 [docs/mobile.md](docs/mobile.md)） | — |
| `weifuwu/components` | **113 个组件** | Button/Table/Modal/Confirm/Toast/... + `confirm()` / `toast()` 命令式中间件 | weifuwu/ui-dom |
| `weifuwu/layout` | **CSS 布局** | 58 个布局原语 + 136 个工具类 + 167 个主题 Token（也支持 `weifuwu/layout/style.css`） | — |

---

## 能力速查（任务 → API）

按任务场景找入口（完整参考见对应 docs）：

| 任务 | 用 | 位置 |
|------|-----|------|
| 起 HTTP 服务 + 路由 | `serve(app)` + `new Router()` + `app.get/post/...` | [docs/server.md](docs/server.md) |
| 渲染页面（SPA / SSR+hydrate） | `ui()` + `ssrPage(router)`；`uiServe(router, { root, hydrate })` | [docs/frontend-ui-dom.md](docs/frontend-ui-dom.md) · [docs/frontend.md](docs/frontend.md) |
| 数据持久化 | `postgres()` → `` ctx.sql`SELECT *` `` · `redis()` → `ctx.redis` · **`sql.query`**（Query Language AST 双后端） | [docs/data.md](docs/data.md) |
| 零数据库开发/测试 | `createMemorySql()` / `MemoryRedis`——契约同真库、替换成本为零 | [docs/data.md](docs/data.md) |
| 数据管道（SSR 预取/hydration/SPA） | `ctx.data.get(key)` + async 组件 | [docs/frontend.md](docs/frontend.md) |
| 用户注册/登录/会话/多租户 | `userSystem()` → `ctx.auth` + `/api/auth/*` | [docs/saas.md](docs/saas.md) |
| 限流防爆破 | `rateLimit()` + `ctx.limit()` | [docs/saas.md](docs/saas.md) |
| 发邮件 | `email()` → `ctx.email`（Resend/SMTP） | [docs/saas.md](docs/saas.md) |
| 实时消息/聊天/通知 | `messager()` → `ctx.msg` + `app.ws` | [docs/saas.md](docs/saas.md) |
| 后台任务/定时 | `queue()` → `ctx.queue` · `scheduler()` → `ctx.schedule/cron` | [docs/saas.md](docs/saas.md) |
| AI 对话 / Agent / HITL 审批 | `ai()` → `ctx.ai` + `ctx.ui.useChat()` + `AiChat` | [docs/saas.md](docs/saas.md) |
| GraphQL / WebSocket | `app.graphql(handler)` · `app.ws(path, handler)` | [docs/realtime.md](docs/realtime.md) |
| 前端 UI 组件 | `weifuwu/components`（113 个：Button/Table/Modal/AiChat/...） | [docs/components.md](docs/components.md) |
| 布局/主题/暗色 | `weifuwu/layout`（58 原语 + 136 工具类 + 167 Token） | [docs/layout.md](docs/layout.md) |
| 样式定制（零自定义 CSS） | `--wf-*` 变量覆盖 + 组件定制钩子 | [docs/styling.md](docs/styling.md) |
| 移动端适配（tap/长按/键盘/弹层） | `usePopup` / `useHoverCapable` / `useLongPress` / `useVisualViewport` | [docs/mobile.md](docs/mobile.md) |
| 前后端类型安全中间件 | `createMiddleware`（声明注入即类型化） | [docs/server.md](docs/server.md) |

---

## 核心概念

### 三层形态（路由 / 组件 / async 组件工厂）

| 层 | 签名 | 异步 | 生命周期 |
|----|------|------|---------|
| **UIHandler**（路由） | `async (location, ctx) => VNode` | ✅ 整体 | 每次路由变化执行 |
| **Component**（唯一形态） | `async (initProps, ctx) => (props) => Promise<VNode>` | ✅ 工厂 + renderFn | mount 一次 + render 每次；同步组件已不支持（类型强制 Promise） |

异步只在两个边界——路由 handler（整页）和组件工厂（数据声明）+ renderFn（强制异步）。渲染器按「返回值 instanceof Promise」统一判别：主路径 `buildVNode` async 预构建（await 全部工厂，兄弟并行）→ 原子落地（无**中间态**占位、无补全回调——注意：数组内 false/null 的静态诊断占位 `<!--wf-hole-->` 是另一回事，见「VDOM 输出透明」）；运行时首次挂载的 async 组件同样在 buildVNode 阶段 await；骨架屏 `uiServe({ loading })` + `handle.ready`。
### 两阶段组件（新手必读：为什么是两层）

组件 = `async (initProps, ctx) => (props) => Promise<VNode>`——**外层 = 初始化（只执行一次，可 await 数据），内层 = 渲染（每次状态/props 变化时执行，强制异步）**。类比：外层是对象的构造函数，内层是它的 render 方法。

```tsx
const Counter = async (_init, ctx) => {
  // 外层（mount）：只跑一次——初始化状态、订阅、定时器（可 await 数据）
  let count = 0
  return async (props) =>
    // 内层（render）：每次变化执行（强制异步）——读状态输出视图（render-only：改状态后显式 render()）
    <button onClick={() => { count++; ctx.ui.render() }}>{count}</button>
}
```

> 为什么不是单层函数（React 风格）？单层函数每次渲染都执行整个函数体，需要 hooks 记忆机制来区分"初始化"和"渲染"；两阶段用**位置即语义**——外层天生只跑一次，没有 hooks 规则、没有依赖数组、没有闭包陷阱。
> 异步数据用原生 async 组件（见下文）：`async (initProps, ctx) => await ctx.data.get(...)` → 返回 renderFn，数据经闭包注入。

### 中间件模式（前后端一致）

```
后端:  app.use(cors())
       app.use(postgres())
       app.get('/users', (req, ctx) => { ctx.sql`SELECT *` })
       // ctx 已注入 ctx.sql

前端:  const router = new UIRouter()
       router.use(api({ baseURL: '/api' }))
       router.use(auth())
       router.get('/users', async (location, ctx) => h(UsersPage, {}))
       uiServe(router, { root: '#root' })
       // ctx 已注入 ctx.api, ctx.auth
```

前端 req = `window.location`（原生对象，不包装），res = `VNode`，`uiServe` = VDOM 落地——与后端 `Request → Response`、`serve(router)` 完全同构。

### 状态管理

| 模式 | 后端 | 前端 |
|------|------|------|
| 注入 | 中间件注入 ctx.field | 中间件注入 ctx.field |
| 读取 | handler 读取 ctx | 组件读取 ctx |
| 渲染 | 返回 Response | `ctx.ui.render()` 触发局部 VDOM patch（render-only）；共享状态 `createStore` + `useExternal` |

### async 组件（三条纪律）

async 组件让"拿数据渲染页面"像写同步代码——签名与同步组件一致，唯一差别是 `async` 关键字：`async (initProps, ctx) => renderFn`。异步只在工厂边界：

```tsx
const UserProfile = async (_init, ctx) => {
  const user = await ctx.data.get(`/api/user/${ctx.params.id}`)   // ① 工厂层：声明数据（三场景自动）
  let liked = false                                                // ② mount：客户端状态（render-only）
  return async (props) =>
    h('div', {},
      h('p', {}, user.name),          // 服务端状态（闭包，SSR 进 HTML）
      h('button', { onClick: () => { liked = !liked; ctx.ui.render() } }, liked ? '❤️' : '🤍'))
}
```

**三条纪律**（不遵守就是隐性 bug）：

| 纪律 | 反例 | 正确 |
|---|---|---|
| ① 数据 key 必须含维度 | `ctx.data.get('/api/user')`——`/users/1 → /users/2` 导航命中旧缓存 | `ctx.data.get(\`/api/user/${ctx.params.id}\`)` |
| ② 会变的数据放组件状态 | `const count = data.count`——点击永不更新 | `let count = data.count` + 交互后 `ctx.ui.render()`（初始值 seed 自服务端数据） |
| ③ 初始状态必须确定性 | `let w = window.innerWidth`——SSR/hydration mismatch | 用服务端数据 seed，交互后再测 |

**常见坑**：
- 工厂按**实例**执行（N 处实例 = N 次工厂调用）——数据必须走 `ctx.data`（自带缓存 + 并发合并，重复执行零成本）；禁止副作用/昂贵操作裸写工厂
- 闭包数据是页面加载时的**快照**——路由参数变化靠工厂重跑刷新（key 变 → 缓存 miss → 重新取数）
- **个性化数据不进 `ctx.data`**——SSR 会把工厂取数结果序列化给所有客户端，会话/用户相关数据留在客户端 `let` + fetch + `render()`

### 渲染策略：SPA 还是 SSR？

组件与路由的写法**完全一样**，差异只有入口两行：

| | SPA | SSR + Hydration |
|---|---|---|
| 适用 | 应用页（后台、工具、Dashboard） | 内容页（博客、营销，需要 SEO/首屏） |
| 后端 | HTML 外壳 | `ssrPage(router, { url })` 一行（自动完整 HTML + `__DATA__`） |
| 客户端 | `uiServe(router, { root: '#root' })` | `uiServe(router, { root: '#root', hydrate: true })` |

**怎么选**：默认 SPA；需要 SEO 或首屏即内容时用 SSR。两种模式可混合——一个 app 内 `ssrPage` 匹配共享 router，未匹配 `next()` 走普通 handler。

### Closeable 接口

所有有状态模块（postgres、redis）实现 `close(): Promise<void>`，serve 关闭时自动调用。

---


---

## 文档导航

README 只保留入门内容（设计理念 / 快速开始 / 核心概念 / 模块总览）。完整 API 参考按**开发者角色**拆分在 `docs/`：

### 后端开发者

| 文档 | 内容 |
|------|------|
| [docs/server.md](docs/server.md) | HTTP 服务层：Router / serve / cors / serveStatic / HttpError / 响应辅助 / parseBody |
| [docs/data.md](docs/data.md) | 数据层：postgres（PG v3 自研协议）/ redis（RESP2 自研协议）/ Query Language（AST 双后端）/ Memory 实现（零数据库）/ 测试零外部依赖 |
| [docs/realtime.md](docs/realtime.md) | 实时与渲染：scheduler / ui（SSR + JS/CSS 编译）/ graphql / WebSocket |
| [docs/saas.md](docs/saas.md) | SaaS 地基：rateLimit / email / userSystem / messager / queue / ai |
| [docs/ai-contract.md](docs/ai-contract.md) | AI Stream Protocol：wf: 事件（SSE 下行 + POST 上行）——流式/工具/审批 |

### 前端开发者

| 文档 | 内容 |
|------|------|
| [docs/frontend.md](docs/frontend.md) | 前端核心：应用引导（UIRouter+uiServe）/ 组件模型 / 异步组件 / 状态管理 / 条件与列表 / ref / 类型（weifuwu/client 已并入 ui-dom） |
| [docs/frontend-ui-dom.md](docs/frontend-ui-dom.md) | **ui-dom**：UIRouter 纯路由 + uiServe 渲染运行时 + ctx 注入链 + components 复用 + SSR/hydration（前端唯一运行时——weifuwu/client 已删除） |
| [docs/frontend-middleware.md](docs/frontend-middleware.md) | 前端中间件：router / api / auth / ws / i18n / ErrorBoundary / confirm / toast / ScrollLock / extendCtx |
| [docs/components.md](docs/components.md) | 组件库（113 个组件 + 使用示例 + 组件列表） |
| [docs/layout.md](docs/layout.md) | 布局系统：58 个布局原语 + 136 个工具类 + 167 个主题 Token |
| [docs/style-guide.md](docs/style-guide.md) | 样式学习路径与命名规范：三档学习（组件 → 原语 → 速查）|
| [docs/styling.md](docs/styling.md) | 样式定制指南：零自定义 CSS 模式 / 暗色 / 组件级覆盖 / 作用域主题 |

### 通用

| 文档 | 内容 |
|------|------|
| [docs/examples.md](docs/examples.md) | 组合场景示例：登录表单 / 数据列表 + 搜索 / 消息提示 |
| [docs/environment.md](docs/environment.md) | 环境变量与开发命令 |
| [docs/mobile.md](docs/mobile.md) | 移动端开发指南：断点 / 44px 命中区 / usePopup / 手势 / safe-area |
| [docs/components-map.md](docs/components-map.md) | 组件速查：weifuwu ↔ antd / Element Plus / shadcn 对应 + 迁移路径 |
| [docs/custom-components.md](docs/custom-components.md) | 自定义组件开发指南：usePopup / useControlled / 动画 / AI 组件 / 类型纪律 |

> `docs/` 用户文档随 npm 包发布（`files: ['dist/', 'README.md', 'docs/']`）——`node_modules/weifuwu/docs` 可离线查阅。
