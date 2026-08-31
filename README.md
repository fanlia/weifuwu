# weifuwu

**自托管全栈框架** — 一个 npm 包 = 后端 HTTP + 前端 VDOM + 129 组件 + CSS 设计系统 + SaaS 地基（认证 / 消息 / 队列 / AI）。全自研、零构建、消灭样板。

```bash
npm install weifuwu      # 一个依赖，完整应用栈
```

**本地开发（apps/ 下的应用）**：dev 模式经 `node_modules/weifuwu/*` 软链解析到源码
（`import 'weifuwu/vdom'` 等——esbuild bundle 的模块解析；tsconfig paths 只管类型）。
新环境 `npm install` 后执行 `node scripts/dev-links.mjs` 创建软链（apps 运行前提）。
发布时才编译 dist（`node scripts/release.mjs`——dev 零构建）。

**定位**：面向需要完整应用栈、又不想缝合多个框架/服务、且重视代码与数据所有权的开发者——独立开发者、小团队、自托管/私有化部署。尤其当应用包含 **认证 + 实时消息 + AI 对话 + 后台管理** 时，weifuwu 把这些「每个应用都要的地基」全部内置为一行 `app.use(...)`。

### 五个关键卖点

| 卖点 | 为什么重要 |
|------|-----------|
| **一个包，零构建** | 服务端 `node --import weifuwu/dev` 直跑 `.tsx`；浏览器 CDN import map 即用；CSS 一条 link 即得完整设计系统——没有构建步骤、没有脚手架 |
| **协议层全自研** | PG v3 / RESP2 / GraphQL schema / OpenAI 流式协议全部自研——确定性、可预测、错误模型统一；诚实裁剪：**不支持的能力明确报错，绝不静默降级** |
| **消灭样板** | 动态编译免构建、`useAsyncData` 一个 hook 覆盖 SSR 预取/hydration/SPA、自研 DB 客户端免双重编码与 parseRow 样板 |
| **SaaS 地基随包内置** | rateLimit / email / userSystem / messager / queue / ai 六个中间件**互相咬合**（身份是消息的路由）——从「自建基础设施」变「声明业务」 |
| **自托管友好** | 运行时仅 esbuild + graphql + ws；部署 = 一个 Node 进程 + Postgres + Redis；数据、代码、模型全部在自己手里 |

### 一个包 = 五层能力

| 层 | 入口 | 能力 |
|----|------|------|
| 后端 | `weifuwu` | Trie 路由 / 中间件链 / serve / 自研 PG+Redis / SSR / GraphQL / WebSocket |
| 前端 | `weifuwu/vdom` | **vdom 引擎**——UIRouter（路由唯一入口：get/notFound/has/resolve——`(Request, ctx) => Response` 签名对齐后端）+ uiServe（浏览器 boot）+ uiSsr（服务端渲染——SSR ≡ SPA 首帧结构吸收）+ 命令流渲染（NDJSON 命令纯数据可回放）；**weifuwu/components 直接复用**（VNode 契约唯一来源 vdom） |
| 组件 | `weifuwu/components` | 129 个 HTML 原语组件（表单/表格/弹层/AiChat…），引用 `--wf-*` 主题变量 |
| 样式 | `weifuwu/layout` | 48 布局原语 + 90 工具类 + 183 主题 Token，零自定义 CSS 文件 |
| SaaS 地基 | 随包内置 | rateLimit / email / userSystem / messager / queue / ai → `ctx.*` 一行接入 |

> ⚠️ **注意：前后端都有 `ctx.ui`，但用途完全不同**
> - **后端** `ctx.ui`（SSR/编译）：`ctx.ui.html`（HTML 模板）、`ctx.ui.js`（TSX→JS 动态编译）、`ctx.ui.css`（CSS 编译）、`ctx.ui.ssr`（组件 SSR）
> - **前端** `ctx.ui`（渲染引擎，20+ hooks——**一切会变化的值都是 getter**）：
>   - 数据：`useAsyncData(fetcher, key)`（唯一异步边界——同 key 并发合并/竞态取消/缓存保留/SSR 种子预热——**作者零退订零竞态代码**）
>   - 状态：`signal(n)`（getter 读 + set/update 写——变化自动重渲染）/ `useObservable(obs$)`（任何 Observable → getter）/ `useExternal()`（共享状态）
>   - 受控：`useControlled()`（受控/非受控）/ `useControlledInput()`（逐键回流）
>   - 弹层：`usePopup()`（统一能力层——锚定浮层 + 会话级模态）/ `usePopupPosition()`（定位）
>   - 事件：`useInView()` / `useScrollPosition()` / `useMedia()` / `useBreakpoint()` / `useGlobalKey()` / `useDrag()` / `useDragDrop()` / `useHoverCapable()` / `useLongPress()` / `useVisualViewport()`
>   - 动画：`useAnimationEnd()` / `usePresence()`（显隐状态机）/ `useTween()` / `useReducedMotion()`
>   - AI/生命周期：`useChat()`（AI 会话）/ `hold(fn)`（卸载清理——等价 onUnmount）
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

> 定位不是「替代某个框架」，而是**包换包**：用 weifuwu 一个依赖替换你原本要缝合的整套栈。心智模型有借鉴（组件模型接近 React、中间件接近 Express），但每一层都是自研的确定性实现——组件模型见[核心概念](#核心概念)，与 antd/Element Plus/shadcn 的对应见 [docs/components-map.md](docs/components-map.md)。

### 从这里开始

| 你想… | 去哪 |
|--------|------|
| 10 分钟跑通 SPA + SSR | [快速开始](#快速开始) |
| 零后端原型（一个 HTML 文件） | [CDN 快速原型](#cdn-快速原型零构建纯-html) |
| 按任务找 API（认证/消息/AI/移动端…） | [能力速查](#能力速查任务--api) |
| 读完整 API 参考 | [文档导航](#文档导航) |

---

## 设计理念

> 顶部「定位」回答了**是什么 / 为什么**；以下是**哲学展开**——五条核心哲学与技术原则。

### 核心哲学

**① 一个包，全栈一体。** 后端、前端、组件、样式装在一个 npm 包里，零配置、零构建、纯 link 可用：服务端 `--import weifuwu/dev` 直接跑 `.tsx`（Node loader + esbuild 同步编译）；浏览器 CDN import map 直接跑；CSS 一条 link 即得完整设计系统。

**② 全自研，诚实裁剪。** VDOM、PG v3 / RESP2 协议、GraphQL schema、OpenAI 兼容流式协议——全部自研而非包装他人。动机不是炫技而是**确定性**：自研客户端输出确定、行为可预测、错误模型统一。配套纪律是诚实裁剪：**不支持的能力明确抛 `ProtocolError('unsupported')`，绝不静默降级或"尽量支持"**。

**③ 消灭样板。** 框架的每一层都在消灭一类样板代码：

| 样板 | 消灭方式 |
|---|---|
| 构建样板 | 动态编译（`ctx.ui.js` / `weifuwu/dev`），改代码即刷即用，零构建步骤 |
| 样式样板 | WUI 设计语言 + 语义原语 + 变量定制，零自定义 CSS 文件（`--wf-brand-seed` 改一个值全站换肤，暗色自动派生） |
| 异步样板 | `useAsyncData` 内建并发合并/竞态取消/缓存保留/SSR 种子——**作者零退订、零竞态、零 loading 样板** |
| 协议样板 | 自研 PG/Redis 客户端消灭双重编码、parseRow 样板、`'EX'` 参数顺序陷阱 |

**④ SaaS 地基，应用必须的一等能力。** 不只是库——rateLimit / email / userSystem / messager / queue 五个中间件随包内置，且互相咬合：**身份是消息的路由，消息是身份的交互**（`sendTo(ctx.user.id)` 按身份路由、`createConversation(ctx.user.id)` 创建者即身份、成员校验自动对齐），AI 对话走同一协议。开发者从「自建基础设施」变「声明业务」——一个多租户 AI 平台（agent-platform）已完整消费这层地基。

**⑤ 错误现形，自愈不可消音。** 渲染错误** hole 降级 + 下一拍重试**是容错不是静默——错误必须计数现形（`error-counter` 同错去重不刷屏、恢复清出再报）；路由错误同样去重计数。dev 仪表 `window.__wfRenderHealth` 四轴读数（频率/规模/复用/错误）——**问题出现即读数**，不是问题出现后翻日志。

### 技术原则（哲学的展开）

**零运行时依赖** — 前端无 npm 运行时依赖（自研 VDOM，不引入 Virtual DOM 库、rxjs、immer 等）。后端仅依赖 `esbuild`（TSX→JS 编译）+ `graphql` + `ws`（语言/协议本身）——**数据库客户端（PostgreSQL/Redis 协议）、GraphQL schema 工具全部自研**。

**前后端同构，机制公用、实现不一样** — handler 签名 `(req: Request, ctx) => Response` 双端字面同构；**路由内核五层单源**（`src/shared/router/`：trie 匹配 / pipeline 流程骨架 / context URL 解析与 ctx 注入 / chain 中间件链 / ctx-fields 扩展注册表）——`Router.handler()` 与 `UIRouter.resolve()` 跑同一个 `dispatchRouter`，差异点（verb 表/404 形态/错误语义/ctx 扩展）钩子化，**serve（Request/Response 编解码边界）留各自域**。

**工厂同步，异步边界全在 hooks，渲染纯同步** — 组件 = `(initProps, ctx) => (props) => VNode`（**同步工厂——async 即编译错**）。数据加载 `useAsyncData`、多源汇流 `useObservable`——异步全部收敛在 hooks 内部流管道（卸载自动退订——零泄漏）；渲染纯同步（无 async 渲染、无中间态占位）。**一条规则易学易写易用**。

**信号 getter 纪律** — 一切会变化的值 = `() => T`——**任何位置调用返回最新值**——没有「必须在 render 内调用」的位置规则。`signal` 读 getter + set/update 写，变化自动重渲染；hooks 全部 getter 化（`useScrollPosition()` 返回最新位置）。

**VDOM 输出透明（命令流可回放）** — 渲染 = **命令流**（NDJSON 纯数据——13 种命令完整自足：create/insert/setText/…）——DOM = fold(命令流)，可记录、可回放、可断言。VDOM 对用户输入零 magic：条件渲染的 false 在 DOM 里是诊断占位注释，数组项 key 与组件实例 id 直接落 DOM——devtools 看到的 DOM 就是引擎决策的可读输出。

**对账防线（演绎保证——错必被抓）** — 双树终态等价对账器 + 命令流模拟器（Sim）+ 状态机迁移表（编译期穷尽）+ fuzz 生成器（1310 对多种子）——**状态机保证暴露机制完整，对账器保证错误必被抓**，两者互补缺一不可。四层验证体系见 [AGENTS.md](AGENTS.md)。

**中间件注入一切** — 后端和前端共用同一理念：中间件向 `ctx` 注入能力（`ctx.sql` / `ctx.redis` / `ctx.api` / `ctx.auth` / `ctx.i18n` / `ctx.limit` / `ctx.email` / `ctx.queue` / `ctx.ai` / `ctx.msg` 等），Handler/组件从 `ctx` 读取——**注入声明（injects/depends）双端同一注册表机制**。

---

## 快速开始

两种模式，**组件和路由的写法完全一样**，差异只有后端/客户端入口两行：

| 模式 | 适用场景 | 后端 | 客户端入口 |
|------|---------|------|-----------|
| **SPA** | 应用页（Dashboard、工具、后台） | HTML 外壳 | `uiServe(router, { root })` |
| **SSR + Hydration** | 内容页（博客、营销，需要 SEO/首屏） | `uiSsr(router, url)`（HTML + `__DATA__` 种子） | `uiServe`（结构吸收——首帧复用服务端 DOM） |

### 先写共享部分（两种模式都一样）

```tsx
// router.tsx —— 路由树（UIRouter——前后端同一棵树——单一实现源）
import { UIRouter, h, type UIContext } from 'weifuwu/vdom'

const Home = (_: unknown, ctx: UIContext) => {
  // 数据管道：一个 API 三场景（SSR 预取 / hydration 命中 / SPA fetch）
  const [getMsg] = ctx.ui.useAsyncData(() => fetch('/api/hello').then((r) => r.json()), 'hello')
  const msg = getMsg()
  if (!msg) return <p>加载中…</p>
  return <h1>{msg.msg}</h1>
}

export function buildRouter(): UIRouter {
  const router = new UIRouter()
  router.get('/', () => h(Home))
  router.get('/u/:id', (req, ctx) => h('h1', {}, `用户 ${ctx.params.id}`))   // :param 注入
  router.notFound(() => h('h1', {}, '404'))
  return router
}
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
// src/client.ts —— 浏览器 boot（uiServe——UIRouter 唯一应用入口）
import { uiServe } from 'weifuwu/vdom'
import { buildRouter } from './router.tsx'

uiServe(buildRouter(), { root: '#root' })   // 监听导航 → 匹配 → 命令流渲染
```

### 模式 B：SSR + Hydration（内容页/SEO）

同一份 `routes`、同一个组件，差异只在**后端构建事件流 → HTML + 序列化事件，客户端回放**：

```ts
// server.ts —— SSR：同一棵路由树 → 完整 HTML + __DATA__（SSR ≡ SPA 首帧）
import { serve, Router, ui, cors } from 'weifuwu'
import { uiSsr } from 'weifuwu/vdom'
import { buildRouter } from './router.tsx'

const router = new Router()
router.use(cors())
router.use(ui())

// SSR：路由树单源 → 服务端渲染 → HTML + __DATA__ 种子（客户端结构吸收零闪跳）
router.get('*', async (req, ctx) => {
  const html = await uiSsr(buildRouter(), new URL(req.url).pathname, {
    title: '我的应用',
    prefetch: async () => ({ hello: await (await fetch('http://localhost:3000/api/hello')).json() }),
  })
  return ctx.ui.html.unsafe(html)
})

router.get('/static/app.js', (req, ctx) => ctx.ui.js('./src/client.ts'))
router.get('/api/hello', () => Response.json({ msg: 'world' }))

serve(router, { port: 3000 })
```

```ts
// src/client.ts —— 结构吸收（uiServe 首帧复用服务端 DOM——零闪跳）
import { uiServe } from 'weifuwu/vdom'
import { buildRouter } from './router.tsx'

// 同一棵路由树：服务端 HTML 被吸收（焦点/输入值保持），之后正常交互渲染
uiServe(buildRouter(), { root: '#root' })
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
# ① showcase——weifuwu 发展引擎：组件/页面/应用/后端/能力/指南 一站式（活体 demo + 文档同源）
cd apps/showcase && node server.ts
# 打开 http://localhost:3200（LLM: curl /llms.txt）

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

  <!-- 组件样式（可选，如只用 weifuwu/vdom 则不需要） -->
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
        "weifuwu/vdom": "https://unpkg.com/weifuwu@latest/dist/vdom/index.js",
        "weifuwu/components": "https://unpkg.com/weifuwu@latest/dist/components/index.js"
      }
    }
  </script>

  <script type="module">
    import { UIRouter, uiServe, h } from 'weifuwu/vdom'

    // 路由树（UIRouter——get/notFound——(req, ctx) => Response 同构后端）
    const router = new UIRouter()
    router.get('/', () => h('h1', {}, 'Hello weifuwu'))
    router.get('/u/:id', (req, ctx) => h('h1', {}, `用户 ${ctx.params.id}`))
    router.notFound(() => h('h1', {}, '404'))

    // 浏览器 boot（uiServe——监听导航 → 匹配 → 命令流渲染）
    uiServe(router, { root: '#root' })
  </script>
  <!-- 对照服务端：new Router().get('/', () => new Response(...))——同一签名形状 -->
</body>
</html>
```

| 模块 | CDN 路径 | 说明 |
|------|---------|------|
| `weifuwu/vdom` | `https://unpkg.com/weifuwu@latest/dist/vdom/index.js` | 前端运行时（UIRouter, uiServe, h/jsx, hooks 等） |
| `weifuwu/components` | `https://unpkg.com/weifuwu@latest/dist/components/index.js` | 129 个 UI 组件（Button, Card, Table, Modal, Icon 等） |
| `weifuwu/components` | `https://unpkg.com/weifuwu@latest/dist/components/style.css` | 组件 CSS + 183 个主题 Token + 48 个布局原语 + 90 个工具类 |
| 独立布局系统 | `https://unpkg.com/weifuwu@latest/dist/layout/weifuwu-layout.css` | 仅 CSS 布局，不依赖 JS |


---

## 模块总览

| 导入路径 | 模块 | 用途 | 依赖 |
|---------|------|------|------|
| `weifuwu` | **Router** | Trie 路由 + 中间件链 + WebSocket + GraphQL | — |
| `src/shared/router` | **路由内核（前后端共享五层单源）** | trie（匹配）+ pipeline（流程骨架）+ context（URL 解析/ctx 注入）+ chain（中间件链）+ ctx-fields（ctx 扩展注册表）——**同一套机制双端复用**，serve（编解码边界）留各自域 | — |
| `weifuwu` | **serve** | HTTP 服务器 | Router |
| `weifuwu` | **cors** | CORS 跨域中间件 | Router |
| `weifuwu` | **serveStatic** | 静态文件服务（ETag/304/目录索引） | Router |
| `weifuwu` | **postgres** | PostgreSQL 客户端（自研 PG v3 协议）→ `ctx.sql`；**Query Language**（`sql.query` AST 双后端——真库编译 SQL / 内存直执行） | Router, DATABASE_URL |
| `weifuwu` | **redis** | Redis 客户端（自研 RESP2 协议）→ `ctx.redis` | Router, REDIS_URL |
| `weifuwu/db` | **Memory 实现** | `createMemorySql()` / `MemoryRedis`——生产契约黑盒实现（开发/测试/单实例零数据库）；`MemoryRedisServer`/`MemoryPostgresServer`——进程内线协议服务器（协议测试零 docker） | — |
| `weifuwu` | **ui** | SSR 渲染 + esbuild JS/CSS 动态编译 → `ctx.ui` | Router |
| `weifuwu/vdom` | **UIRouter** | 前端路由唯一入口：get/notFound/has/resolve——`(req, ctx) => Response` 签名对齐后端——params/query/route 注入（shared Trie 五层单源） | — |
| `weifuwu/vdom` | **uiServe / uiSsr** | uiServe 浏览器 boot（导航监听 → 命令流渲染）；uiSsr 服务端渲染（HTML + `__DATA__` 种子——**结构吸收** SSR ≡ SPA 首帧） | Router, ui |
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
| `weifuwu/vdom` | **命令流渲染引擎** | 渲染 = 命令流（NDJSON 纯数据——13 命令完整自足——可回放可断言）；**事件代理**（监听 O(1)——零重绑——统一注册表）；三状态机 + 对账器（终态等价 fuzz 1310 对防线） | — |
| `weifuwu/vdom` | **渲染健康仪表** | `window.__wfRenderHealth`（频率/规模/复用/错误四轴——dev 模式——渲染问题出现即读数） | — |
| `weifuwu/vdom` | **组件契约** | 工厂同步（`(initProps, ctx) => RenderFn`）——异步边界全在 hooks（useAsyncData/useObservable）——渲染纯同步（见[核心概念](#核心概念)） | — |
| `weifuwu/vdom` | **useAsyncData** | 数据管道：同 key 并发合并 / 竞态取消 / 缓存保留 / SSR 种子预热（`ctx.ui.useAsyncData(fetcher, key)`） | — |
| `weifuwu/vdom` | **api / auth / ws / i18n** | HTTP 客户端 / 认证 / WebSocket / 国际化中间件（ctx 注入） | — |

| `weifuwu/vdom` | **hooks 全家** | usePopup/useControlled/useExternal/useInView/useScrollPosition/useTween/useBreakpoint/... （getter 纪律——任意位置读最新） | — |
| `weifuwu/vdom` | **useChat / AiChat 原语** | AI 会话（流式/工具调用/HITL） | — |
| `weifuwu/vdom` | **事件原语** | `usePopup`（统一弹窗能力层）/ `usePresence` / `useInView` / `useScrollPosition` / `useGlobalKey` / `useDrag` / `useDragDrop` / `useAnimationEnd` / `useTween` / `useReducedMotion`（浏览器事件/动画统一入口，见 —） | — |
| `weifuwu/components` | **129 个组件** | Button/Table/Modal/Confirm/Toast/... + `confirm()` / `toast()` 命令式中间件 | weifuwu/vdom |
| `weifuwu/layout` | **CSS 布局** | 48 个布局原语 + 90 个工具类 + 183 个主题 Token（也支持 `weifuwu/layout/style.css`） | — |

---

## 能力速查（任务 → API）

按任务场景找入口（完整参考见对应 docs）：

| 任务 | 用 | 位置 |
|------|-----|------|
| 起 HTTP 服务 + 路由 | `serve(app)` + `new Router()` + `app.get/post/...` | — |
| 渲染页面（SPA / SSR） | `UIRouter` + `uiServe(router, { root })`；SSR = `uiSsr(router, url)`（结构吸收——首帧零差异） | — · — |
| 数据持久化 | `postgres()` → `` ctx.sql`SELECT *` `` · `redis()` → `ctx.redis` · **`sql.query`**（Query Language AST 双后端） | — |
| 零数据库开发/测试 | `createMemorySql()` / `MemoryRedis`——契约同真库、替换成本为零 | — |
| 数据管道（SSR 预取/hydration/SPA） | `ctx.ui.useAsyncData(fetcher, key)`（并发合并/竞态取消/SSR 种子） | — |
| 用户注册/登录/会话/多租户 | `userSystem()` → `ctx.auth` + `/api/auth/*` | — |
| 限流防爆破 | `rateLimit()` + `ctx.limit()` | — |
| 发邮件 | `email()` → `ctx.email`（Resend/SMTP） | — |
| 实时消息/聊天/通知 | `messager()` → `ctx.msg` + `app.ws` | — |
| 后台任务/定时 | `queue()` → `ctx.queue` · `scheduler()` → `ctx.schedule/cron` | — |
| AI 对话 / Agent / HITL 审批 | `ai()` → `ctx.ai` + `ctx.ui.useChat()` + `AiChat` | — |
| GraphQL / WebSocket | `app.graphql(handler)` · `app.ws(path, handler)` | — |
| 前端 UI 组件 | `weifuwu/components`（129 个：Button/Table/Modal/AiChat/...） | — |
| 布局/主题/暗色 | `weifuwu/layout`（49 原语 + 90 工具类 + 183 Token） | — |
| 样式定制（零自定义 CSS） | `--wf-*` 变量覆盖 + 组件定制钩子 | — |
| 移动端适配（tap/长按/键盘/弹层） | `usePopup` / `useHoverCapable` / `useLongPress` / `useVisualViewport` | — |
| 前后端类型安全中间件 | `createMiddleware`（声明注入即类型化） | — |

---

## 核心概念

### 一条规则：工厂同步、异步在 hooks、渲染纯同步

```tsx
type Component<P, C> = (initProps: P, ctx: C) => RenderFn<P>   // 工厂同步（毫秒即挂载完）
type RenderFn<P> = (props: P) => VNode | null | (VNode | null)[]  // 渲染纯同步
```

```tsx
const Counter = (_init, ctx) => {
  // 工厂（mount 一次）：建 signal、订阅、定时器——同步执行
  const count = ctx.ui.signal(0)
  return () => (
    // 渲染（每次变化自动执行）：读 getter——最新值
    <button onClick={() => count.set((c) => c + 1)}>{count()}</button>
  )
}
```

> **为什么工厂必须同步？** 同步工厂 = 毫秒级挂载（无 mounting 窗口、无 async
> 竞态、SSR/客户端行为完全一致）。异步需求全部收敛到 hooks 内部流管道——
> 作者层面**没有 await 渲染**这件事。事件回调内 `await` 合法（非渲染路径）。

### 数据：useAsyncData（唯一异步边界）

```tsx
const Home = (_: unknown, ctx: UIContext) => {
  const [getMsg, reload] = ctx.ui.useAsyncData(
    () => fetch('/api/hello').then((r) => r.json()), 'hello')
  const msg = getMsg()                  // getter——最新值（null = loading/降级）
  if (!msg) return <p>加载中…</p>
  return <h1>{msg.msg} <button onClick={reload}>刷新</button></h1>
}
```

**内建语义（作者零代码）**：同 key 并发合并（N 组件 fetch 1 次）· 竞态取消
（旧请求作废）· 缓存保留（重挂载零请求）· 卸载自动退订（零泄漏）· SSR 种子
预热（首帧零请求）。多源汇流：`ctx.ui.useObservable(obs$)` + `combineLatest`。

### 路由：前后端同一内核

```
后端:  const app = new Router()
       app.get('/u/:id', (req, ctx) => Response.json(ctx.params))
       serve(app, { port: 3000 })

前端:  const router = new UIRouter()
       router.get('/u/:id', (req, ctx) => h('h1', {}, ctx.params.id))
       uiServe(router, { root: '#root' })
```

**`(req: Request, ctx) => Response` 字面同构**——两者内部跑同一个
`dispatchRouter`（`src/shared/router/` 五层单源：trie 匹配 / pipeline 骨架 /
context 解析与注入 / chain 中间件链 / ctx-fields 注册表）。差异点钩子化：
verb 表（server）/ctx.route 注入（client）/404 形态——**serve（编解码边界）留各自域**。

### 中间件注入一切（前后端一致）

```
后端:  app.use(cors()); app.use(postgres())
       app.get('/users', (req, ctx) => ctx.sql`SELECT *`)
       // ctx 已注入 ctx.sql——injects/depends 声明受检

前端:  ctx.ui.useAsyncData / useObservable / useChat / hold
       // ctx.ui 渲染原语面——信号 getter 纪律
```

### 状态管理

| 场景 | API | 语义 |
|------|-----|------|
| 组件内状态 | `ctx.ui.signal(n)` | getter 读 + set/update 写——变化自动重渲染 |
| 跨组件共享 | `createStore` + `ctx.ui.useExternal(store)` | 共享状态订阅——getter 最新 |
| 任意 Observable | `ctx.ui.useObservable(obs$, initial)` | rxjs 风格流 → getter（卸载自动退订） |
| 服务端状态 | handler 返回 Response | 每请求独立 |

### 渲染策略：SPA 还是 SSR？

组件与路由的写法**完全一样**，差异只有入口两行：

| | SPA | SSR + Hydration |
|---|---|---|
| 适用 | 应用页（后台、工具、Dashboard） | 内容页（博客、营销，需要 SEO/首屏） |
| 后端 | HTML 外壳 | `uiSsr(router, url)`（完整 HTML + `__DATA__` 种子——同一棵路由树） |
| 客户端 | `uiServe(router, { root })` | **结构吸收**（首帧复用服务端 DOM——焦点/输入值保持——失败原子回退重建） |

**怎么选**：默认 SPA；需要 SEO 或首屏即内容时用 SSR。两种模式可混合。

### VDOM 输出透明

- **命令流可回放**：渲染 = NDJSON 命令流（纯数据）——DOM = fold(命令流)——
  可记录/回放/断言（测试基础设施与渲染本体同源）
- **诊断占位**：条件渲染 false → `<!--wf-hole-->` 注释锚（兄弟不误删）
- **id 落 DOM**：`data-wf-id` / `data-wf-key`——devtools 即引擎决策日志
- **非法输入显式化**：重复 key warn（不静默）、事件非函数 warn、受控缺回调
  warn——**A 级检测兜底**

### Closeable 接口

所有有状态模块（postgres、redis）实现 `close(): Promise<void>`，serve 关闭时自动调用（WS 1001 握手先行 + 重复 close 幂等）。

---

## 文档导航

README 只保留入门内容（设计理念 / 快速开始 / 核心概念 / 模块总览）。完整 API 参考按**开发者角色**拆分在 `docs/`：

### 后端开发者

| 文档 | 内容 |
|------|------|
| — | HTTP 服务层：Router / serve / cors / serveStatic / HttpError / 响应辅助 / parseBody |
| — | 数据层：postgres（PG v3 自研协议）/ redis（RESP2 自研协议）/ Query Language（AST 双后端）/ Memory 实现（零数据库）/ 测试零外部依赖 |
| — | 实时与渲染：scheduler / ui（SSR + JS/CSS 编译）/ graphql / WebSocket |
| — | SaaS 地基：rateLimit / email / userSystem / messager / queue / ai |
| [docs/ai-contract.md](docs/ai-contract.md) | AI Stream Protocol：wf: 事件（SSE 下行 + POST 上行）——流式/工具/审批 |

### 前端开发者

| 文档 | 内容 |
|------|------|
| — | 前端核心：应用引导（UIRouter/uiServe）/ 组件模型（工厂同步 + hooks 异步边界）/ 状态管理 / 条件与列表 / ref |
| — | **vdom**：命令流渲染引擎（UIRouter + uiServe/uiSsr + hooks）——components 复用 + SSR 结构吸收（前端唯一运行时） |
| — | 前端中间件：router / api / auth / ws / i18n / ErrorBoundary / confirm / toast / ScrollLock / extendCtx |
| — | 组件库（129 个组件 + 使用示例 + 组件列表） |
| — | 布局系统：48 个布局原语 + 90 个工具类 + 183 个主题 Token |
| [docs/style-guide.md](docs/style-guide.md) | 样式学习路径与命名规范：三档学习（组件 → 原语 → 速查）|
| — | 样式定制指南：零自定义 CSS 模式 / 暗色 / 组件级覆盖 / 作用域主题 |

### 通用

| 文档 | 内容 |
|------|------|
| [docs/examples.md](docs/examples.md) | 组合场景示例：登录表单 / 数据列表 + 搜索 / 消息提示 |
| [docs/environment.md](docs/environment.md) | 环境变量与开发命令 |
| — | 移动端开发指南：断点 / 44px 命中区 / usePopup / 手势 / safe-area |
| [docs/components-map.md](docs/components-map.md) | 组件速查：weifuwu ↔ antd / Element Plus / shadcn 对应 + 迁移路径 |
| — | 自定义组件开发指南：usePopup / useControlled / 动画 / AI 组件 / 类型纪律 |

> **贡献**：见 [CONTRIBUTING.md](CONTRIBUTING.md)——四条路径（文档/测试/demo/组件）+ 质量防线。
>
> `docs/` 用户文档随 npm 包发布（`files: ['dist/', 'README.md', 'docs/']`）——`node_modules/weifuwu/docs` 可离线查阅。
